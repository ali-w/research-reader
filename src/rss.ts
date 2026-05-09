import { Article } from './types';

export const DEFAULT_FEED_ENDPOINT =
  'https://newsletter-processor-660809700014.europe-west2.run.app/articles?secret=AliWAliW';

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
}

// Extract a readable sender name from SRS bounce address format
// e.g. "SRS0=e9f5=df=dailyupdate.tldrnewsletter.com=...@domain" → "dailyupdate.tldrnewsletter.com"
function extractNewsletterSource(newsletterName: string): string {
  const match = newsletterName.match(/=df=([^=@]+)/);
  if (match) return match[1];
  const atMatch = newsletterName.match(/^([^@]+)@/);
  return atMatch ? atMatch[1] : newsletterName;
}

export async function fetchArticlesFromEndpoint(endpointUrl: string = DEFAULT_FEED_ENDPOINT): Promise<Article[]> {
  const response = await fetch(endpointUrl);
  if (!response.ok) throw new Error(`Server returned ${response.status}`);

  const data: ApiArticle[] = await response.json();

  return data.map((item) => ({
    id: String(item.id),
    title: item.title,
    link: item.url,
    content: item.summary,
    pubDate: new Date(item.received_at),
    source: extractNewsletterSource(item.newsletter_name),
    newsletterName: item.newsletter_name,
    status: item.status ?? 'unread',
    rating: (item.rating ?? undefined) as Article['rating'],
    notes: item.notes ?? '',
    createdAt: new Date(),
    updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
  }));
}
