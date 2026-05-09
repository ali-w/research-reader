import { useState, useEffect } from 'react';
import { Article } from '../types';
import { format } from 'date-fns';

interface ArticleReaderProps {
  article: Article;
  onUpdate: (article: Article) => void;
  onGenerateSummary: (article: Article) => void;
  isOnline: boolean;
}

function ArticleReader({
  article,
  onUpdate,
  onGenerateSummary,
  isOnline,
}: ArticleReaderProps) {
  const [notes, setNotes] = useState(article.notes);
  const [showNotes, setShowNotes] = useState(true);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    setNotes(article.notes);
  }, [article.notes]);

  useEffect(() => {
    setShowSummary(false);
  }, [article.id]);

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
      </div>

      <div className="reader-content">
        <div className="content-text">{article.content}</div>
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
