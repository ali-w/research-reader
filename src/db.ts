import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Article, RSSFeed } from './types';
import { SyncPatch } from './sync';

interface ResearchDB extends DBSchema {
  articles: {
    key: string;
    value: Article;
    indexes: { 'by-status': string; 'by-date': Date; 'by-source': string };
  };
  feeds: {
    key: string;
    value: RSSFeed;
  };
  pendingSync: {
    key: string;
    value: {
      id: string;
      action: 'update' | 'create' | 'delete';
      data: Partial<Article>;
      timestamp: Date;
    };
  };
}

let dbInstance: IDBPDatabase<ResearchDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<ResearchDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ResearchDB>('research-reader-db', 1, {
    upgrade(db) {
      // Articles store
      const articleStore = db.createObjectStore('articles', { keyPath: 'id' });
      articleStore.createIndex('by-status', 'status');
      articleStore.createIndex('by-date', 'pubDate');
      articleStore.createIndex('by-source', 'source');

      // RSS feeds store
      db.createObjectStore('feeds', { keyPath: 'url' });

      // Pending sync operations
      db.createObjectStore('pendingSync', { keyPath: 'id' });
    },
  });

  return dbInstance;
}

export async function saveArticle(article: Article): Promise<void> {
  const db = await getDB();
  await db.put('articles', article);
}

export async function getArticle(id: string): Promise<Article | undefined> {
  const db = await getDB();
  return db.get('articles', id);
}

export async function getAllArticles(): Promise<Article[]> {
  const db = await getDB();
  return db.getAll('articles');
}

export async function getArticlesByStatus(status: string): Promise<Article[]> {
  const db = await getDB();
  return db.getAllFromIndex('articles', 'by-status', status);
}

export async function getMaxArticleId(): Promise<number> {
  const db = await getDB();
  const keys = await db.getAllKeys('articles');
  if (keys.length === 0) return 0;
  return Math.max(...keys.map((k) => parseInt(k as string, 10)).filter(Number.isFinite));
}

export async function deleteArticle(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('articles', id);
}

export async function clearAllArticles(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('articles', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

export async function saveFeed(feed: RSSFeed): Promise<void> {
  const db = await getDB();
  await db.put('feeds', feed);
}

export async function getAllFeeds(): Promise<RSSFeed[]> {
  const db = await getDB();
  return db.getAll('feeds');
}

export async function addPendingSync(
  id: string,
  action: 'update' | 'create' | 'delete',
  data: Partial<Article>
): Promise<void> {
  const db = await getDB();
  await db.put('pendingSync', {
    id: `${Date.now()}-${id}`,
    action,
    data,
    timestamp: new Date(),
  });
}

export async function getPendingSyncs() {
  const db = await getDB();
  return db.getAll('pendingSync');
}

// Upserts a sync patch for an article, merging with any existing queued patch
// so that multiple offline changes to the same article coalesce into one entry.
export async function upsertPendingSync(
  articleId: string,
  patch: SyncPatch
): Promise<void> {
  const db = await getDB();
  const existing = await db.get('pendingSync', articleId);
  const merged = existing ? { ...existing.data, ...patch } : patch;
  await db.put('pendingSync', {
    id: articleId,
    action: 'update',
    data: { id: articleId, ...merged } as Partial<Article>,
    timestamp: new Date(),
  });
}

export async function removePendingSyncs(articleIds: string[]): Promise<void> {
  if (articleIds.length === 0) return;
  const db = await getDB();
  const tx = db.transaction('pendingSync', 'readwrite');
  await Promise.all(articleIds.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function clearPendingSyncs(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('pendingSync', 'readwrite');
  await tx.store.clear();
  await tx.done;
}
