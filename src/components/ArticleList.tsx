import { Article } from '../types';
import { format } from 'date-fns';

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
      {articles.map((article) => (
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
            <span className="article-source">{article.source}</span>
            <span className="article-date">
              {format(new Date(article.pubDate), 'MMM d, yyyy')}
            </span>
            {article.notes && (
              <span className="has-notes" title="Has notes">
                📝
              </span>
            )}
            {article.summary && (
              <span className="has-summary" title="Has AI summary">
                ✨
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ArticleList;
