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
  deleteArticle,
} from './db';
import { fetchArticlesFromEndpoint, DEFAULT_READER_ROOT } from './rss';
import { fetchSummaryFromEndpoint, DEFAULT_SUMMARIZE_ROOT, describeArticle } from './llm';
import { patchArticle, batchPatchArticles, SyncPatch, createArticle, deepSearch, deleteArticleRemote } from './sync';
import ArticleList from './components/ArticleList';
import ArticleReader from './components/ArticleReader';
import SettingsPanel from './components/SettingsPanel';
import WebClipper from './components/WebClipper';
import MeditationOverlay from './components/MeditationOverlay';
import './App.css';

function App() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(() => new Set(['unread']));
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    pendingChanges: 0,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showMeditation, setShowMeditation] = useState(false);
  const [meditationMinutes, setMeditationMinutes] = useState(() => {
    const stored = localStorage.getItem('meditation_duration_minutes');
    return stored ? parseInt(stored, 10) : 10;
  });
  const [showClipper, setShowClipper] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [readerRoot, setReaderRoot] = useState(
    localStorage.getItem('reader_api_root') || DEFAULT_READER_ROOT
  );
  const [summarizeRoot, setSummarizeRoot] = useState(
    localStorage.getItem('summarize_api_root') || DEFAULT_SUMMARIZE_ROOT
  );
  const [apiKey, setApiKey] = useState(
    localStorage.getItem('api_key') || ''
  );
  const [isLoading, setIsLoading] = useState(false);
  const [syncErrors, setSyncErrors] = useState<Array<{ id: string; error: string }>>([]);
  const [randomOrder, setRandomOrder] = useState(false);
  const [newArticleCount, setNewArticleCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deepSearchActive, setDeepSearchActive] = useState(false);
  const [deepSearchResults, setDeepSearchResults] = useState<Array<{ id: number; title: string }>>([]);

  // Startup: pull delta then push pending
  useEffect(() => {
    if (navigator.onLine) handleDeltaSync(); // eslint-disable-line react-hooks/exhaustive-deps
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadArticles();
    updateSyncStatus();
    if (navigator.onLine) flushPendingSync();

    const handleOnline = () => { updateSyncStatus(); handleDeltaSync(); };
    const handleOffline = () => updateSyncStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [[...activeFilters].sort().join(','), randomOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadArticles = async () => {
    try {
      const all = await getAllArticles();

      // Derive allTags from the complete set
      const tagSet = new Set(all.flatMap((a) => a.tags ?? []));
      setAllTags([...tagSet].sort());

      // Status / saved filter in-memory — empty set means show all
      const statusFiltered: Article[] = activeFilters.size === 0 ? all : all.filter((a) => {
        if (activeFilters.has('saved') && a.saved) return true;
        if (activeFilters.has(a.status)) return true;
        return false;
      });

      if (randomOrder) {
        for (let i = statusFiltered.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [statusFiltered[i], statusFiltered[j]] = [statusFiltered[j], statusFiltered[i]];
        }
        setArticles([...statusFiltered]);
      } else {
        setArticles(statusFiltered.sort((a: Article, b: Article) => parseInt(b.id, 10) - parseInt(a.id, 10)));
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
            await patchArticle(updatedArticle.id, patch, readerRoot, apiKey);
            setSyncErrors((prev) => prev.filter((e) => e.id !== updatedArticle.id));
            if (patch.saved === true) {
              setTimeout(() => handleRefreshArticle(updatedArticle.id), 20_000);
            }
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
    const url = localStorage.getItem('reader_api_root') || DEFAULT_READER_ROOT;
    const key = localStorage.getItem('api_key') || '';
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

  const handleDeltaSync = async () => {
    if (!navigator.onLine) return;
    setIsSyncing(true);
    try {
      const url = localStorage.getItem('reader_api_root') || DEFAULT_READER_ROOT;
      const key = localStorage.getItem('api_key') || '';
      const lastSync = localStorage.getItem('last_sync_at') ?? undefined;
      const maxId = await getMaxArticleId();

      const fetched = await fetchArticlesFromEndpoint(url, key, lastSync);

      if (fetched.length > 0) {
        for (const article of fetched) await saveArticle(article);
        // Discard pending syncs for articles the server just updated — local copies are stale
        await removePendingSyncs(fetched.map((a) => a.id));
        const newCount = fetched.filter((a) => parseInt(a.id, 10) > maxId).length;
        if (newCount > 0) setNewArticleCount(newCount);
        await loadArticles();
      }

      localStorage.setItem('last_sync_at', new Date().toISOString());
      // Push remaining pending syncs (articles the server didn't touch)
      await flushPendingSync();
    } catch {
      // silently ignore
    } finally {
      setIsSyncing(false);
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
      const summary = await fetchSummaryFromEndpoint(article.id, summarizeRoot, apiKey);
      const updatedArticle = { ...article, summary, updatedAt: new Date() };
      await handleArticleUpdate(updatedArticle);
    } catch (error) {
      console.error('Error generating summary:', error);
      alert('Error generating summary. Please check the endpoint URL and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCached = async (article: Article) => {
    const root = localStorage.getItem('summarize_api_root') || DEFAULT_SUMMARIZE_ROOT;
    const key = localStorage.getItem('api_key') || '';
    window.open(`${root}/articles/${article.id}/cached-content?secret=${key}`, '_blank');
  };

  const handleOpenPdf = (article: Article) => {
    const root = localStorage.getItem('reader_api_root') || DEFAULT_READER_ROOT;
    const key = localStorage.getItem('api_key') || '';
    window.open(`${root}/articles/${article.id}/pdf?secret=${key}`, '_blank');
  };

  const handlePdfUploaded = async (article: Article) => {
    await saveArticle(article);
    await loadArticles();
    setSelectedArticle(article);
    // Re-sync after 90s to pick up completed processingStatus and AI summary
    setTimeout(() => handleDeltaSync(), 90_000); // eslint-disable-line react-hooks/exhaustive-deps
  };

  const handleDeepSearch = async (query: string) => {
    if (!navigator.onLine || query.trim().length < 3) return;
    try {
      const results = await deepSearch(query.trim(), readerRoot, apiKey);
      setDeepSearchResults(results);
    } catch {
      setDeepSearchResults([]);
    }
  };

  const handleDeleteArticle = async (article: Article) => {
    if (!window.confirm(`Delete "${article.title}"? This cannot be undone.`)) return;
    try {
      await deleteArticleRemote(article.id, readerRoot, apiKey);
    } catch {
      // If the server delete fails, abort — don't remove locally
      alert('Failed to delete article from server. Please try again.');
      return;
    }
    await deleteArticle(article.id);
    setSelectedArticle(null);
    await loadArticles();
  };

  const handleRefreshArticle = async (articleId: string) => {
    const url = localStorage.getItem('reader_api_root') || DEFAULT_READER_ROOT;
    const key = localStorage.getItem('api_key') || '';
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
    const endpoint = localStorage.getItem('reader_api_root') || DEFAULT_READER_ROOT;
    const key = localStorage.getItem('api_key') || '';
    const summarizeEp = localStorage.getItem('summarize_api_root') || DEFAULT_SUMMARIZE_ROOT;

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
    localStorage.setItem('reader_api_root', url);
    setReaderRoot(url);
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
              : hasPending || isSyncing ? 'syncing'
              : newArticleCount > 0 ? 'new-articles'
              : 'online';
            const statusText = !syncStatus.isOnline ? 'Offline'
              : hasSyncErrors ? 'Sync failed'
              : hasPending ? 'Syncing...'
              : isSyncing ? 'Checking…'
              : newArticleCount > 0 ? `${newArticleCount} new article${newArticleCount === 1 ? '' : 's'}`
              : 'Online & up to date';
            const tooltip = hasSyncErrors
              ? syncErrors.map((e) => `Article ${e.id}: ${e.error}`).join('\n')
              : undefined;
            const handleStatusClick =
              newArticleCount > 0 ? () => setNewArticleCount(0) :
              dotState === 'online' ? handleDeltaSync :
              undefined;
            return (
              <div
                className="sync-status"
                title={tooltip}
                onClick={handleStatusClick}
                style={handleStatusClick ? { cursor: 'pointer' } : undefined}
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
            className="meditation-btn"
            onClick={() => setShowMeditation(true)}
            aria-label="Meditate"
          >
            🧠
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
          onPdfUploaded={handlePdfUploaded}
          feedEndpoint={readerRoot}
          apiKey={apiKey}
        />
      )}

      {showMeditation && (
        <MeditationOverlay duration={meditationMinutes * 60} onClose={() => setShowMeditation(false)} />
      )}

      {showSettings && (
        <SettingsPanel
          readerRoot={readerRoot}
          summarizeRoot={summarizeRoot}
          apiKey={apiKey}
          meditationMinutes={meditationMinutes}
          onSaveEndpoint={handleSaveEndpoint}
          onSaveSummarizeEndpoint={(url) => {
            localStorage.setItem('summarize_api_root', url);
            setSummarizeRoot(url);
          }}
          onSaveApiKey={handleSaveApiKey}
          onSaveMeditationMinutes={(m) => {
            localStorage.setItem('meditation_duration_minutes', String(m));
            setMeditationMinutes(m);
          }}
          onFetchArticles={handleFetchArticles}
          onClearAndRefresh={handleClearAndRefresh}
          onClose={() => setShowSettings(false)}
          isOnline={syncStatus.isOnline}
        />
      )}

      <div className="filter-bar">
        <div className="filter-row">
          {(['unread', 'later', 'read', 'saved', 'skipped'] as const).map((f) => (
            <button
              key={f}
              className={activeFilters.has(f) ? 'active' : ''}
              onClick={() => setActiveFilters((prev) => {
                const next = new Set(prev);
                next.has(f) ? next.delete(f) : next.add(f);
                return next;
              })}
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
            onChange={(e) => {
              const q = e.target.value;
              setSearchQuery(q);
              if (q.trim().length < 3) {
                setDeepSearchActive(false);
                setDeepSearchResults([]);
              }
            }}
          />
          {searchQuery.trim().length >= 3 && (
            <button
              className={`tag-filter-chip${deepSearchActive ? ' active' : ''}`}
              onClick={() => {
                const next = !deepSearchActive;
                setDeepSearchActive(next);
                if (next) handleDeepSearch(searchQuery);
                else setDeepSearchResults([]);
              }}
              title="Search full text of PDFs and cached pages"
            >
              Deep Search
            </button>
          )}
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
            onArticleUpdate={handleArticleUpdate}
            deepSearchArticles={
              deepSearchActive && deepSearchResults.length > 0
                ? deepSearchResults
                    .map((r) => articles.find((a) => a.id === String(r.id)))
                    .filter((a): a is Article => a !== undefined)
                : undefined
            }
          />
        </div>

        <div className="article-reader-panel">
          {selectedArticle ? (
            <ArticleReader
              article={selectedArticle}
              onUpdate={handleArticleUpdate}
              onGenerateSummary={handleGenerateSummary}
              onRefresh={() => handleRefreshArticle(selectedArticle.id)}
              onOpenCached={() => handleOpenCached(selectedArticle)}
              onOpenPdf={() => handleOpenPdf(selectedArticle)}
              onDelete={() => handleDeleteArticle(selectedArticle)}
              hasCachedContent={!!selectedArticle.cachedContentUrl && selectedArticle.contentType !== 'pdf'}
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
