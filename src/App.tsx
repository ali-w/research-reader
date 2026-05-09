import { useState, useEffect } from 'react';
import { Article, SyncStatus } from './types';
import {
  getAllArticles,
  saveArticle,
  getMaxArticleId,
  clearAllArticles,
  getArticlesByStatus,
  getPendingSyncs,
  upsertPendingSync,
  removePendingSyncs,
  saveFeed,
} from './db';
import { fetchArticlesFromEndpoint, DEFAULT_FEED_ENDPOINT } from './rss';
import { fetchSummaryFromEndpoint, DEFAULT_SUMMARIZE_ENDPOINT } from './llm';
import { patchArticle, batchPatchArticles, SyncPatch } from './sync';
import ArticleList from './components/ArticleList';
import ArticleReader from './components/ArticleReader';
import SettingsPanel from './components/SettingsPanel';
import './App.css';

function App() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read' | 'skipped'>('unread');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    pendingChanges: 0,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState(
    localStorage.getItem('feed_endpoint_url') || DEFAULT_FEED_ENDPOINT
  );
  const [summarizeEndpoint, setSummarizeEndpoint] = useState(
    localStorage.getItem('summarize_endpoint_url') || DEFAULT_SUMMARIZE_ENDPOINT
  );
  const [isLoading, setIsLoading] = useState(false);
  const [syncErrors, setSyncErrors] = useState<Array<{ id: string; error: string }>>([]);
  const [randomOrder, setRandomOrder] = useState(false);

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
      const allArticles =
        filter === 'all'
          ? await getAllArticles()
          : await getArticlesByStatus(filter);
      if (randomOrder) {
        for (let i = allArticles.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allArticles[i], allArticles[j]] = [allArticles[j], allArticles[i]];
        }
        setArticles([...allArticles]);
      } else {
        setArticles(allArticles.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime()));
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
      }

      setSelectedArticle(updatedArticle);

      if (Object.keys(patch).length > 0) {
        if (navigator.onLine) {
          try {
            await patchArticle(updatedArticle.id, patch, endpointUrl);
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
    try {
      const updates = pending.map((p) => ({ id: p.id, ...(p.data as SyncPatch) }));
      const { succeeded, failed } = await batchPatchArticles(updates, url);
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
      const fetched = await fetchArticlesFromEndpoint(url);
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
      const fetched = await fetchArticlesFromEndpoint(url);
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
      const summary = await fetchSummaryFromEndpoint(article.id, summarizeEndpoint);
      const updatedArticle = { ...article, summary, updatedAt: new Date() };
      await handleArticleUpdate(updatedArticle);
    } catch (error) {
      console.error('Error generating summary:', error);
      alert('Error generating summary. Please check the endpoint URL and try again.');
    } finally {
      setIsLoading(false);
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
              : 'online';
            const statusText = !syncStatus.isOnline ? 'Offline'
              : hasSyncErrors ? 'Sync failed'
              : hasPending ? 'Syncing...'
              : 'Online & up to date';
            const tooltip = hasSyncErrors
              ? syncErrors.map((e) => `Article ${e.id}: ${e.error}`).join('\n')
              : undefined;
            return (
              <div className="sync-status" title={tooltip}>
                <span className={`status-dot ${dotState}`} />
                <span className="status-text">{statusText}</span>
                {hasPending && (
                  <span className="pending-badge">{syncStatus.pendingChanges}</span>
                )}
              </div>
            );
          })()}
          <button
            className="settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      {showSettings && (
        <SettingsPanel
          endpointUrl={endpointUrl}
          summarizeEndpoint={summarizeEndpoint}
          onSaveEndpoint={handleSaveEndpoint}
          onSaveSummarizeEndpoint={(url) => {
            localStorage.setItem('summarize_endpoint_url', url);
            setSummarizeEndpoint(url);
          }}
          onFetchArticles={handleFetchArticles}
          onClearAndRefresh={handleClearAndRefresh}
          onClose={() => setShowSettings(false)}
          isOnline={syncStatus.isOnline}
        />
      )}

      <div className="filter-bar">
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={filter === 'unread' ? 'active' : ''}
          onClick={() => setFilter('unread')}
        >
          Unread
        </button>
        <button
          className={filter === 'read' ? 'active' : ''}
          onClick={() => setFilter('read')}
        >
          Read
        </button>
        <button
          className={filter === 'skipped' ? 'active' : ''}
          onClick={() => setFilter('skipped')}
        >
          Skipped
        </button>
        <button
          className={`random-toggle ${randomOrder ? 'active' : ''}`}
          onClick={() => setRandomOrder(!randomOrder)}
          title="Shuffle article order"
        >
          Shuffle Order
        </button>
      </div>

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">Loading...</div>
        </div>
      )}

      <div className="main-content">
        <div className="article-list-panel">
          <ArticleList
            articles={articles}
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
              isOnline={syncStatus.isOnline}
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
