import { useState, useEffect } from 'react';
import { Article, SyncStatus } from './types';
import {
  getAllArticles,
  saveArticle,
  getMaxArticleId,
  clearAllArticles,
  getPendingSyncs,
  upsertPendingSync,
  removePendingSyncs,
  saveFeed,
} from './db';
import { fetchArticlesFromEndpoint, DEFAULT_FEED_ENDPOINT } from './rss';
import { fetchSummaryFromEndpoint, DEFAULT_SUMMARIZE_ENDPOINT, describeArticle } from './llm';
import { patchArticle, batchPatchArticles, SyncPatch, createArticle } from './sync';
import ArticleList from './components/ArticleList';
import ArticleReader from './components/ArticleReader';
import SettingsPanel from './components/SettingsPanel';
import WebClipper from './components/WebClipper';
import './App.css';

function App() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read' | 'skipped' | 'saved'>('unread');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    pendingChanges: 0,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showClipper, setShowClipper] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState(
    localStorage.getItem('feed_endpoint_url') || DEFAULT_FEED_ENDPOINT
  );
  const [summarizeEndpoint, setSummarizeEndpoint] = useState(
    localStorage.getItem('summarize_endpoint_url') || DEFAULT_SUMMARIZE_ENDPOINT
  );
  const [apiKey, setApiKey] = useState(
    localStorage.getItem('api_key') || 'AliWAliW'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [syncErrors, setSyncErrors] = useState<Array<{ id: string; error: string }>>([]);
  const [randomOrder, setRandomOrder] = useState(false);
  const [newArticleCount, setNewArticleCount] = useState(0);

  // Startup-only: silently fetch new articles once on mount
  useEffect(() => {
    if (!navigator.onLine) return;
    (async () => {
      try {
        const url = localStorage.getItem('feed_endpoint_url') || DEFAULT_FEED_ENDPOINT;
        const key = localStorage.getItem('api_key') || 'AliWAliW';
        const maxId = await getMaxArticleId();
        const fetched = await fetchArticlesFromEndpoint(url, key);
        const fresh = fetched.filter((a) => parseInt(a.id, 10) > maxId);
        if (fresh.length > 0) {
          for (const article of fresh) await saveArticle(article);
          await loadArticles();
          setNewArticleCount(fresh.length);
        }
      } catch {
        // silently ignore — user can manually fetch via Settings
      }
    })();
  }, []);

  useEffect(() => {
    loadArticles();
    updateSyncStatus();
    if (navigator.onLine) flushPendingSync();

    const handleOnline = () => { updateSyncStatus(); flushPendingSync(); };
    const handleOffline = () => updateSyncStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [filter, randomOrder]);

  const loadArticles = async () => {
    try {
      const all = await getAllArticles();

      // Derive allTags from the complete set
      const tagSet = new Set(all.flatMap((a) => a.tags ?? []));
      setAllTags([...tagSet].sort());

      // Status / saved filter in-memory
      const statusFiltered: Article[] =
        filter === 'all' ? all :
        filter === 'saved' ? all.filter((a) => a.saved === true) :
        all.filter((a) => a.status === filter);

      if (randomOrder) {
        for (let i = statusFiltered.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [statusFiltered[i], statusFiltered[j]] = [statusFiltered[j], statusFiltered[i]];
        }
        setArticles([...statusFiltered]);
      } else {
        setArticles(statusFiltered.sort((a: Article, b: Article) => b.pubDate.getTime() - a.pubDate.getTime()));
      }
    } catch (error) {
      console.error('Error loading articles:', error);
    }
  };

  const updateSyncStatus = async () => {
    const pending = await getPendingSyncs();
    setSyncStatus({
      isOnline: navigator.onLine,
      lastSync: new Date(),
      pendingChanges: pending.length,
    });
  };

  const handleArticleUpdate = async (updatedArticle: Article) => {
    try {
      await saveArticle(updatedArticle);
      await loadArticles();

      // Diff against the previous selectedArticle to build a minimal sync patch.
      // Summary changes are excluded — those originate from the server, not the client.
      const patch: SyncPatch = {};
      if (selectedArticle) {
        if (updatedArticle.status !== selectedArticle.status) patch.status = updatedArticle.status;
        if (updatedArticle.rating !== selectedArticle.rating) patch.rating = updatedArticle.rating ?? null;
        if (updatedArticle.notes !== selectedArticle.notes) patch.notes = updatedArticle.notes;
        if ((updatedArticle.saved ?? false) !== (selectedArticle.saved ?? false))
          patch.saved = updatedArticle.saved ?? false;
        if (JSON.stringify(updatedArticle.tags) !== JSON.stringify(selectedArticle.tags))
          patch.tags = updatedArticle.tags ?? [];
      }

      setSelectedArticle(updatedArticle);

      if (Object.keys(patch).length > 0) {
        if (navigator.onLine) {
          try {
            await patchArticle(updatedArticle.id, patch, endpointUrl, apiKey);
            setSyncErrors((prev) => prev.filter((e) => e.id !== updatedArticle.id));
          } catch {
            await upsertPendingSync(updatedArticle.id, patch);
          }
        } else {
          await upsertPendingSync(updatedArticle.id, patch);
        }
        await updateSyncStatus();
      }
    } catch (error) {
      console.error('Error updating article:', error);
    }
  };

  const flushPendingSync = async () => {
    const pending = await getPendingSyncs();
    if (pending.length === 0) return;
    const url = localStorage.getItem('feed_endpoint_url') || DEFAULT_FEED_ENDPOINT;
    const key = localStorage.getItem('api_key') || 'AliWAliW';
    try {
      const updates = pending.map((p) => ({ id: p.id, ...(p.data as SyncPatch) }));
      const { succeeded, failed } = await batchPatchArticles(updates, url, key);
      await removePendingSyncs(succeeded.map(String));
      setSyncErrors(failed.map((f) => ({ id: String(f.id), error: f.error })));
      await updateSyncStatus();
    } catch (error) {
      console.error('Failed to flush pending sync:', error);
    }
  };

  const handleFetchArticles = async (url: string) => {
    if (!navigator.onLine) {
      alert('You are offline. Please connect to the internet to fetch new articles.');
      return;
    }

    setIsLoading(true);
    try {
      const maxId = await getMaxArticleId();
      const fetched = await fetchArticlesFromEndpoint(url, apiKey);
      const newArticles = fetched.filter((a) => parseInt(a.id, 10) > maxId);

      for (const article of newArticles) {
        await saveArticle(article);
      }

      await saveFeed({ url, title: 'Newsletter Feed', lastFetched: new Date() });
      await loadArticles();
      alert(`Fetched ${fetched.length} articles (${newArticles.length} new)`);
    } catch (error) {
      console.error('Error fetching articles:', error);
      alert('Error fetching articles. Please check the endpoint URL and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAndRefresh = async (url: string) => {
    if (!navigator.onLine) {
      alert('You are offline. Please connect to the internet to fetch new articles.');
      return;
    }

    setIsLoading(true);
    try {
      await clearAllArticles();
      setSelectedArticle(null);
      const fetched = await fetchArticlesFromEndpoint(url, apiKey);
      for (const article of fetched) {
        await saveArticle(article);
      }
      await saveFeed({ url, title: 'Newsletter Feed', lastFetched: new Date() });
      await loadArticles();
      alert(`Cleared and reloaded ${fetched.length} articles`);
    } catch (error) {
      console.error('Error refreshing articles:', error);
      alert('Error refreshing articles. Please check the endpoint URL and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateSummary = async (article: Article) => {
    if (!navigator.onLine) {
      alert('You are offline. Summary generation requires an internet connection.');
      return;
    }

    setIsLoading(true);
    try {
      const summary = await fetchSummaryFromEndpoint(article.id, summarizeEndpoint, apiKey);
      const updatedArticle = { ...article, summary, updatedAt: new Date() };
      await handleArticleUpdate(updatedArticle);
    } catch (error) {
      console.error('Error generating summary:', error);
      alert('Error generating summary. Please check the endpoint URL and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshArticle = async (articleId: string) => {
    const url = localStorage.getItem('feed_endpoint_url') || DEFAULT_FEED_ENDPOINT;
    const key = localStorage.getItem('api_key') || 'AliWAliW';
    const fetched = await fetchArticlesFromEndpoint(url, key);
    const updated = fetched.find((a) => a.id === articleId);
    if (!updated) return;
    await saveArticle(updated);
    if (selectedArticle?.id === articleId) setSelectedArticle(updated);
    await loadArticles();
  };

  const handleClip = async ({
    url,
    title,
    summary,
    tags,
    contentType,
    useAI,
    onPhaseChange,
  }: {
    url: string;
    title: string;
    summary?: string;
    tags: string[];
    contentType: 'webpage';
    useAI: boolean;
    onPhaseChange: (phase: 'describing') => void;
  }) => {
    const endpoint = localStorage.getItem('feed_endpoint_url') || DEFAULT_FEED_ENDPOINT;
    const key = localStorage.getItem('api_key') || 'AliWAliW';
    const summarizeEp = localStorage.getItem('summarize_endpoint_url') || DEFAULT_SUMMARIZE_ENDPOINT;

    const { id } = await createArticle(
      { title, url, summary, tags, content_type: contentType, saved: true },
      endpoint,
      key
    );

    const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    const now = new Date();
    const article: Article = {
      id: String(id),
      title,
      link: url,
      content: summary ?? '',
      pubDate: now,
      source: hostname,
      status: 'unread',
      saved: true,
      tags,
      contentType,
      notes: '',
      createdAt: now,
      updatedAt: now,
    };

    await saveArticle(article);
    await loadArticles();

    if (useAI) {
      onPhaseChange('describing');
      await describeArticle(String(id), summarizeEp, key);
      await handleRefreshArticle(String(id));
    }
  };

  const handleSelectArticle = (article: Article) => {
    if (selectedArticle?.id === article.id) return;
    setSelectedArticle(article);
    if (article.status === 'unread') {
      handleArticleUpdate({ ...article, status: 'read', updatedAt: new Date() });
    }
  };

  const handleSaveEndpoint = (url: string) => {
    localStorage.setItem('feed_endpoint_url', url);
    setEndpointUrl(url);
  };

  const handleSaveApiKey = (key: string) => {
    localStorage.setItem('api_key', key);
    setApiKey(key);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Research Reader</h1>
        <div className="header-actions">
          {(() => {
            const hasSyncErrors = syncErrors.length > 0;
            const hasPending = syncStatus.pendingChanges > 0;
            const dotState = !syncStatus.isOnline ? 'offline'
              : hasSyncErrors ? 'sync-error'
              : hasPending ? 'syncing'
              : newArticleCount > 0 ? 'new-articles'
              : 'online';
            const statusText = !syncStatus.isOnline ? 'Offline'
              : hasSyncErrors ? 'Sync failed'
              : hasPending ? 'Syncing...'
              : newArticleCount > 0 ? `${newArticleCount} new article${newArticleCount === 1 ? '' : 's'}`
              : 'Online & up to date';
            const tooltip = hasSyncErrors
              ? syncErrors.map((e) => `Article ${e.id}: ${e.error}`).join('\n')
              : undefined;
            return (
              <div
                className="sync-status"
                title={tooltip}
                onClick={newArticleCount > 0 ? () => setNewArticleCount(0) : undefined}
                style={newArticleCount > 0 ? { cursor: 'pointer' } : undefined}
              >
                <span className={`status-dot ${dotState}`} />
                <span className="status-text">{statusText}</span>
                {hasPending && (
                  <span className="pending-badge">{syncStatus.pendingChanges}</span>
                )}
              </div>
            );
          })()}
          <button
            className="clip-btn"
            onClick={() => setShowClipper(true)}
            aria-label="Add article"
          >
            + Clip
          </button>
          <button
            className="settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      {showClipper && (
        <WebClipper
          allTags={allTags}
          isOnline={syncStatus.isOnline}
          onClose={() => setShowClipper(false)}
          onClip={handleClip}
        />
      )}

      {showSettings && (
        <SettingsPanel
          endpointUrl={endpointUrl}
          summarizeEndpoint={summarizeEndpoint}
          apiKey={apiKey}
          onSaveEndpoint={handleSaveEndpoint}
          onSaveSummarizeEndpoint={(url) => {
            localStorage.setItem('summarize_endpoint_url', url);
            setSummarizeEndpoint(url);
          }}
          onSaveApiKey={handleSaveApiKey}
          onFetchArticles={handleFetchArticles}
          onClearAndRefresh={handleClearAndRefresh}
          onClose={() => setShowSettings(false)}
          isOnline={syncStatus.isOnline}
        />
      )}

      <div className="filter-bar">
        <div className="filter-row">
          {(['all', 'unread', 'read', 'skipped', 'saved'] as const).map((f) => (
            <button
              key={f}
              className={filter === f ? 'active' : ''}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button
            className={`random-toggle ${randomOrder ? 'active' : ''}`}
            onClick={() => setRandomOrder(!randomOrder)}
            title="Shuffle article order"
          >
            Shuffle Order
          </button>
          <button
            className={`mobile-filter-toggle ${(showMobileFilters || !!searchQuery || !!selectedTag) ? 'active' : ''}`}
            onClick={() => setShowMobileFilters((v) => !v)}
            aria-label="Toggle search and tag filters"
          >
            {(showMobileFilters || !!searchQuery || !!selectedTag) ? 'Search ▲' : 'Search ▼'}
          </button>
        </div>
        <div className={`filter-expandable${(showMobileFilters || !!searchQuery || !!selectedTag) ? '' : ' collapsed'}`}>
        <div className="search-row">
          <input
            type="search"
            className="search-input"
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {allTags.length > 0 && (
          <div className="tag-filter-row">
            <button
              className={`tag-filter-chip ${selectedTag === null ? 'active' : ''}`}
              onClick={() => setSelectedTag(null)}
            >
              All Tags
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                className={`tag-filter-chip ${selectedTag === tag ? 'active' : ''}`}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
        </div>
      </div>

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">Loading...</div>
        </div>
      )}

      <div className="main-content">
        <div className="article-list-panel">
          <ArticleList
            articles={(() => {
              let list = articles;
              if (selectedTag) list = list.filter((a) => a.tags?.includes(selectedTag));
              if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                list = list.filter(
                  (a) =>
                    a.title.toLowerCase().includes(q) ||
                    a.content.toLowerCase().includes(q) ||
                    a.notes.toLowerCase().includes(q) ||
                    (a.summary ?? '').toLowerCase().includes(q)
                );
              }
              return list;
            })()}
            selectedArticle={selectedArticle}
            onSelectArticle={handleSelectArticle}
          />
        </div>

        <div className="article-reader-panel">
          {selectedArticle ? (
            <ArticleReader
              article={selectedArticle}
              onUpdate={handleArticleUpdate}
              onGenerateSummary={handleGenerateSummary}
              onRefresh={() => handleRefreshArticle(selectedArticle.id)}
              isOnline={syncStatus.isOnline}
              allTags={allTags}
            />
          ) : (
            <div className="empty-state">
              <p>Select an article to read</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
