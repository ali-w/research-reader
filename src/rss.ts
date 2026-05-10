import { Article } from './types';

export const DEFAULT_FEED_ENDPOINT =
  'https://reader-api-ufwk6luuiq-ew.a.run.app/articles';

interface ApiArticle {
  id: number;
  newsletter_id: number;
  title: string;
  summary: string;
  url: string;
  article_created_at: string;
  newsletter_name: string;
  received_at: string;
  status?: 'unread' | 'read' | 'skipped';
  saved?: boolean;
  rating?: number | null;
  notes?: string;
  tags?: string[];
  content_type?: 'newsletter' | 'webpage' | 'pdf';
  updated_at?: string;
  note_updated_at?: string;
  cached_content_url?: string | null;
  cached_at?: string | null;
}

export async function fetchArticlesFromEndpoint(
  endpointUrl: string = DEFAULT_FEED_ENDPOINT,
  apiKey: string = ''
): Promise<Article[]> {
  const response = await fetch(`${endpointUrl}?limit=200`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!response.ok) throw new Error(`Server returned ${response.status}`);

  const data: ApiArticle[] = await response.json();

  return data.map((item) => ({
    id: String(item.id),
    title: item.title,
    link: item.url,
    content: item.summary,
    pubDate: new Date(item.received_at),
    source: item.newsletter_name,
    newsletterName: item.newsletter_name,
    status: item.status ?? 'unread',
    saved: item.saved ?? false,
    rating: (item.rating ?? undefined) as Article['rating'],
    notes: item.notes ?? '',
    tags: item.tags ?? [],
    contentType: item.content_type ?? 'newsletter',
    cachedContentUrl: item.cached_content_url ?? null,
    cachedAt: item.cached_at ?? null,
    createdAt: new Date(),
    updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
  }));
}
