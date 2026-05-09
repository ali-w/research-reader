export interface Article {
  id: string;
  title: string;
  link: string;
  content: string;
  pubDate: Date;
  source: string;
  newsletterName?: string;
  status: 'unread' | 'read' | 'skipped';
  rating?: 1 | 2 | 3 | 4 | 5;
  notes: string;
  summary?: string;
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
