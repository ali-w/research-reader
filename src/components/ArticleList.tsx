import { useState, useRef } from 'react';
import { Article } from '../types';
import { format } from 'date-fns';

const CONTENT_TYPE_ICON: Record<string, string> = {
  webpage: '🌐',
  pdf: '📄',
};

const SWIPE_THRESHOLD = 80;
const SWIPE_MAX = 120;

interface ArticleListProps {
  articles: Article[];
  selectedArticle: Article | null;
  onSelectArticle: (article: Article) => void;
  onArticleUpdate: (article: Article) => void;
  deepSearchArticles?: Article[];
}

function ArticleItem({
  article,
  isSelected,
  onSelect,
  onArticleUpdate,
}: {
  article: Article;
  isSelected: boolean;
  onSelect: () => void;
  onArticleUpdate: (article: Article) => void;
}) {
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const swipeActive = useRef(false);

  const visibleTags = (article.tags ?? []).slice(0, 3);
  const contentIcon = article.contentType ? CONTENT_TYPE_ICON[article.contentType] : undefined;
  const isProcessing = article.processingStatus === 'pending' || article.processingStatus === 'processing';

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    swipeActive.current = true;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swipeActive.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // If vertical movement dominates early on, cancel swipe so scroll works
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < 10) {
      swipeActive.current = false;
      setIsSwiping(false);
      setTranslateX(0);
      return;
    }

    if (dx < 0) {
      e.preventDefault(); // prevent scroll while swiping left
      setTranslateX(Math.max(dx, -SWIPE_MAX));
    }
  };

  const handleTouchEnd = () => {
    if (!swipeActive.current) return;
    swipeActive.current = false;
    setIsSwiping(false);

    if (translateX <= -SWIPE_THRESHOLD) {
      onArticleUpdate({ ...article, status: 'skipped', updatedAt: new Date() });
    }
    setTranslateX(0);
  };

  const skipProgress = Math.min(Math.abs(translateX) / SWIPE_THRESHOLD, 1);

  return (
    <div className="article-item-swipe-wrapper">
      <div
        className="article-item-swipe-hint"
        style={{ opacity: skipProgress }}
        aria-hidden="true"
      >
        Skip ✕
      </div>
      <div
        className={`article-item ${isSelected ? 'selected' : ''} ${article.status}`}
        data-swiping={isSwiping ? 'true' : 'false'}
        style={{ transform: translateX !== 0 ? `translateX(${translateX}px)` : undefined }}
        onClick={onSelect}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="article-header">
          <h3 className="article-title">{article.title}</h3>
          {article.rating && (
            <div className="article-rating">{'★'.repeat(article.rating)}</div>
          )}
        </div>
        <div className="article-meta">
          {contentIcon && <span title={article.contentType}>{contentIcon}</span>}
          <span className="article-source">{article.source}</span>
          <span className="article-date">
            {format(new Date(article.pubDate), 'MMM d, yyyy')}
          </span>
          {article.notes && (
            <span className="has-notes" title="Has notes">📝</span>
          )}
          {article.summary && (
            <span className="has-summary" title="Has AI summary">✨</span>
          )}
          {article.cachedContentUrl && !isProcessing && (
            <span
              className="has-cache"
              title={`Cached${article.cachedAt ? ' ' + format(new Date(article.cachedAt), 'MMM d') : ''}`}
            >
              💾
            </span>
          )}
          {isProcessing && (
            <span className="has-processing" title="AI processing">⏳</span>
          )}
        </div>
        {article.senderEmail && (
          <div className="article-sender">From: {article.senderEmail}</div>
        )}
        {visibleTags.length > 0 && (
          <div className="article-tags">
            {visibleTags.map((tag) => (
              <span key={tag} className="article-tag-chip">{tag}</span>
            ))}
            {(article.tags ?? []).length > 3 && (
              <span className="article-tag-more">+{(article.tags ?? []).length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ArticleList({ articles, selectedArticle, onSelectArticle, onArticleUpdate, deepSearchArticles }: ArticleListProps) {
  if (articles.length === 0 && (!deepSearchArticles || deepSearchArticles.length === 0)) {
    return (
      <div className="empty-list">
        <p>No articles found</p>
        <p className="hint">Fetch articles in Settings to get started</p>
      </div>
    );
  }

  return (
    <div className="article-list">
      {articles.map((article) => (
        <ArticleItem
          key={article.id}
          article={article}
          isSelected={selectedArticle?.id === article.id}
          onSelect={() => onSelectArticle(article)}
          onArticleUpdate={onArticleUpdate}
        />
      ))}
      {deepSearchArticles && deepSearchArticles.length > 0 && (
        <>
          <div className="deep-search-divider">
            <span>Deep Search Results</span>
          </div>
          {deepSearchArticles.map((article) => (
            <ArticleItem
              key={`ds-${article.id}`}
              article={article}
              isSelected={selectedArticle?.id === article.id}
              onSelect={() => onSelectArticle(article)}
              onArticleUpdate={onArticleUpdate}
            />
          ))}
        </>
      )}
    </div>
  );
}

export default ArticleList;
