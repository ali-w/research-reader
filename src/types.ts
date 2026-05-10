export interface Article {
  id: string;
  title: string;
  link: string;
  content: string;
  pubDate: Date;
  source: string;
  newsletterName?: string;
  status: 'unread' | 'read' | 'skipped';
  saved?: boolean;
  rating?: 1 | 2 | 3 | 4 | 5;
  notes: string;
  summary?: string;
  tags?: string[];
  contentType?: 'newsletter' | 'article' | 'video' | 'podcast' | 'webpage' | 'notebook' | 'pdf' | 'other';
  cachedContentUrl?: string | null;
  cachedAt?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RSSFeed {
  url: string;
  title: string;
  lastFetched?: Date;
}

export interface SyncStatus {
  isOnline: boolean;
  lastSync?: Date;
  pendingChanges: number;
}
