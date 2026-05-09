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
  rating?: number | null;
  notes?: string;
  updated_at?: string;
  note_updated_at?: string;
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
    rating: (item.rating ?? undefined) as Article['rating'],
    notes: item.notes ?? '',
    createdAt: new Date(),
    updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
  }));
}
