import { Article } from '../types';
import { format } from 'date-fns';

const CONTENT_TYPE_ICON: Record<string, string> = {
  webpage: '🌐',
  pdf: '📄',
};

interface ArticleListProps {
  articles: Article[];
  selectedArticle: Article | null;
  onSelectArticle: (article: Article) => void;
}

function ArticleList({ articles, selectedArticle, onSelectArticle }: ArticleListProps) {
  if (articles.length === 0) {
    return (
      <div className="empty-list">
        <p>No articles found</p>
        <p className="hint">Fetch articles in Settings to get started</p>
      </div>
    );
  }

  return (
    <div className="article-list">
      {articles.map((article) => {
        const visibleTags = (article.tags ?? []).slice(0, 3);
        const contentIcon = article.contentType ? CONTENT_TYPE_ICON[article.contentType] : undefined;

        return (
          <div
            key={article.id}
            className={`article-item ${
              selectedArticle?.id === article.id ? 'selected' : ''
            } ${article.status}`}
            onClick={() => onSelectArticle(article)}
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
              {article.cachedContentUrl && (
                <span
                  className="has-cache"
                  title={`Cached${article.cachedAt ? ' ' + format(new Date(article.cachedAt), 'MMM d') : ''}`}
                >
                  💾
                </span>
              )}
            </div>
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
        );
      })}
    </div>
  );
}

export default ArticleList;
