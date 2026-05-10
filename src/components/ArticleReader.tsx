import { useState, useEffect, useRef } from 'react';
import { Article } from '../types';
import { format } from 'date-fns';

interface ArticleReaderProps {
  article: Article;
  onUpdate: (article: Article) => void;
  onGenerateSummary: (article: Article) => void;
  onRefresh: () => Promise<void>;
  onOpenCached: () => Promise<void>;
  onOpenPdf: () => void;
  onDelete: () => void;
  hasCachedContent: boolean;
  isOnline: boolean;
  allTags: string[];
}

function ArticleReader({
  article,
  onUpdate,
  onGenerateSummary,
  onRefresh,
  onOpenCached,
  onOpenPdf,
  onDelete,
  hasCachedContent,
  isOnline,
  allTags,
}: ArticleReaderProps) {
  const [notes, setNotes] = useState(article.notes);
  const [showNotes, setShowNotes] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openingCache, setOpeningCache] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNotes(article.notes);
  }, [article.notes]);

  useEffect(() => {
    setShowSummary(false);
    setTagInput('');
  }, [article.id]);

  const currentTags = article.tags ?? [];

  const tagSuggestions = tagInput.trim()
    ? allTags.filter(
        (t) =>
          t.toLowerCase().includes(tagInput.toLowerCase()) &&
          !currentTags.includes(t)
      )
    : allTags.filter((t) => !currentTags.includes(t));

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || currentTags.includes(trimmed)) return;
    onUpdate({ ...article, tags: [...currentTags, trimmed], updatedAt: new Date() });
    setTagInput('');
    setShowTagSuggestions(false);
  };

  const removeTag = (tag: string) => {
    onUpdate({ ...article, tags: currentTags.filter((t) => t !== tag), updatedAt: new Date() });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Escape') {
      setShowTagSuggestions(false);
    }
  };

  const handleStatusChange = (status: Article['status']) => {
    onUpdate({ ...article, status, updatedAt: new Date() });
  };

  const handleRatingChange = (rating: Article['rating']) => {
    onUpdate({ ...article, rating, updatedAt: new Date() });
  };

  const handleSaveNotes = () => {
    onUpdate({ ...article, notes, updatedAt: new Date() });
  };

  const handleShareSummary = () => {
    if (!article.summary) return;

    const shareText = `${article.title}

${article.summary}

Source: ${article.link}
${format(new Date(article.pubDate), 'MMMM d, yyyy')}`;

    if (navigator.share) {
      navigator
        .share({ title: article.title, text: shareText })
        .catch((err) => console.log('Error sharing:', err));
    } else {
      navigator.clipboard.writeText(shareText);
      alert('Summary copied to clipboard!');
    }
  };

  return (
    <div className="article-reader">
      <div className="reader-header">
        <h2>{article.title}</h2>
        <div className="article-info">
          <span className="article-source-label">{article.source}</span>
          <span>{format(new Date(article.pubDate), 'MMMM d, yyyy')}</span>
          <button
            className="refresh-btn"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try { await onRefresh(); } finally { setRefreshing(false); }
            }}
            title="Refresh from server"
          >
            {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
          <button
            className="delete-btn"
            onClick={onDelete}
            title="Delete article"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="reader-actions">
        <div className="action-group">
          <label>Status:</label>
          <button
            className={article.status === 'read' ? 'active' : ''}
            onClick={() => handleStatusChange(article.status === 'read' ? 'unread' : 'read')}
          >
            Read
          </button>
          <button
            className={article.status === 'skipped' ? 'active' : ''}
            onClick={() => handleStatusChange(article.status === 'skipped' ? 'unread' : 'skipped')}
          >
            Skipped
          </button>
          <button
            className={`saved-btn ${article.saved ? 'active' : ''}`}
            onClick={() => onUpdate({ ...article, saved: !article.saved, updatedAt: new Date() })}
          >
            {article.saved ? 'Saved' : 'Save'}
          </button>
        </div>

        <div className="action-group">
          <label>Rating:</label>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              className={`star-btn ${article.rating && article.rating >= star ? 'filled' : ''}`}
              onClick={() => handleRatingChange(star as Article['rating'])}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      {article.contentType === 'pdf' ? (
        <>
          <div className="reader-tabs">
            <button className="reader-tab active">Summary</button>
            {article.cachedContentUrl && (
              <button className="reader-tab" onClick={onOpenPdf}>
                View PDF ↗
              </button>
            )}
          </div>
          <div className="reader-content">
            {article.processingStatus === 'pending' || article.processingStatus === 'processing' ? (
              <div className="content-text" style={{ color: 'var(--text-muted, #888)' }}>
                {!article.content && <p>AI processing… check back shortly.</p>}
                {article.content && <p>{article.content}</p>}
              </div>
            ) : article.processingStatus === 'error' ? (
              <div className="content-text">
                {article.content
                  ? <p>{article.content}</p>
                  : <p style={{ color: 'var(--text-muted, #888)' }}>Processing failed — add a summary manually below.</p>}
              </div>
            ) : (
              <div className="content-text">
                {article.content
                  ? <p>{article.content}</p>
                  : <p style={{ color: 'var(--text-muted, #888)' }}>No summary yet — generate one below.</p>}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="reader-tabs">
            <button className="reader-tab active">Article</button>
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="reader-tab"
            >
              Original Page ↗
            </a>
            {hasCachedContent && (
              <button
                className="reader-tab"
                disabled={openingCache}
                onClick={async () => {
                  setOpeningCache(true);
                  try { await onOpenCached(); } finally { setOpeningCache(false); }
                }}
              >
                {openingCache ? 'Opening…' : 'Cached ↗'}
              </button>
            )}
          </div>
          <div className="reader-content">
            <div className="content-text">{article.content}</div>
          </div>
        </>
      )}

      <div className="tags-section">
        <h3>Tags</h3>
        <div className="tag-chips">
          {currentTags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
              <button className="tag-remove" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="tag-input-wrapper">
          <input
            ref={tagInputRef}
            type="text"
            className="tag-input"
            placeholder="Add a tag..."
            value={tagInput}
            onChange={(e) => {
              setTagInput(e.target.value);
              setShowTagSuggestions(true);
            }}
            onFocus={() => setShowTagSuggestions(true)}
            onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
            onKeyDown={handleTagKeyDown}
          />
          {showTagSuggestions && tagSuggestions.length > 0 && (
            <ul className="tag-suggestions">
              {tagSuggestions.map((tag) => (
                <li key={tag} onMouseDown={() => addTag(tag)}>
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="notes-section">
        <div className="notes-header" onClick={() => setShowNotes(!showNotes)}>
          <h3>Personal Notes</h3>
          <span className="collapse-icon">{showNotes ? '▲' : '▼'}</span>
        </div>
        {showNotes && (
          <>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add your thoughts, insights, or key takeaways..."
              rows={6}
            />
            <button className="save-notes-btn" onClick={handleSaveNotes}>
              Save Notes
            </button>
          </>
        )}
      </div>

      <div className="summary-section">
        <div
          className={`notes-header${article.summary ? '' : ' no-pointer'}`}
          onClick={article.summary ? () => setShowSummary(!showSummary) : undefined}
        >
          <h3>AI-Powered Summary</h3>
          {article.summary && (
            <span className="collapse-icon">{showSummary ? '▲' : '▼'}</span>
          )}
        </div>
        <div className="summary-actions">
          <button
            className={`generate-btn ${!isOnline ? 'disabled' : ''}`}
            onClick={() => onGenerateSummary(article)}
            disabled={!isOnline}
            title={!isOnline ? 'Requires internet connection' : ''}
          >
            {article.summary ? 'Regenerate' : 'Generate'} Summary
          </button>
        </div>

        {showSummary && article.summary && (
          <div className="summary-content">
            <div className="summary-text">{article.summary}</div>
            <button className="share-btn" onClick={handleShareSummary}>
              Share Summary
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ArticleReader;
