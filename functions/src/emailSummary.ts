import { MessageClient } from 'cloudmailin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getUserPreferences } from './db.js';

interface RawArticle {
  id: number | string;
  title: string;
  summary?: string;
  newsletter_name?: string;
  received_at?: string;
  status?: string;
  tags?: string[];
  url?: string;
}

interface ArticleSummaryResult {
  id: string | number;
  title: string;
  newsletter: string;
  url: string;
  lines: [string, string, string];
}

interface GeminiEmailResult {
  articles: ArticleSummaryResult[];
}

function buildEmailHtml(articles: ArticleSummaryResult[], readerUrl: string): string {
  const date = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const articleRows = articles.map((a, i) => {
    const articleLink = a.url
      ? `${readerUrl.replace(/\/+$/, '')}/?articleId=${a.id}`
      : `${readerUrl.replace(/\/+$/, '')}/?articleId=${a.id}`;

    return `
    <tr>
      <td style="padding: 24px 0; border-bottom: 1px solid #e5e7eb;">
        <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">${i + 1} &nbsp;·&nbsp; ${a.newsletter}</p>
        <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #111827; line-height: 1.4;">
          <a href="${articleLink}" style="color: #111827; text-decoration: none;">${a.title}</a>
        </h2>
        <p style="margin: 0 0 6px 0; font-size: 14px; color: #374151; line-height: 1.6;">${a.lines[0]}</p>
        <p style="margin: 0 0 6px 0; font-size: 14px; color: #374151; line-height: 1.6;">${a.lines[1]}</p>
        <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">${a.lines[2]}</p>
        <a href="${articleLink}" style="display: inline-block; margin-top: 12px; font-size: 13px; color: #4f46e5; text-decoration: none; font-weight: 500;">Read article →</a>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Research Reader — Weekly Summary</title>
</head>
<body style="margin: 0; padding: 0; background: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f9fafb; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: #111827; padding: 28px 32px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.1em;">Research Reader</p>
              <h1 style="margin: 6px 0 0 0; font-size: 22px; font-weight: 700; color: #ffffff;">Your Reading Summary</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #6b7280;">${date}</p>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                ${articles.length} article${articles.length !== 1 ? 's' : ''} curated from your unread inbox — matched to your interests.
              </p>
            </td>
          </tr>

          <!-- Articles -->
          <tr>
            <td style="padding: 0 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${articleRows}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                <a href="${readerUrl}" style="color: #6b7280; text-decoration: none;">Open Research Reader</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function runEmailSummary(): Promise<{
  status: string;
  articleCount?: number;
  reason?: string;
}> {
  const serviceUrl = process.env.READER_SERVICE_URL;
  const rssSecret = process.env.RSS_SECRET;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const cloudmailinUsername = process.env.CLOUDMAILIN_USERNAME;
  const cloudmailinApiKey = process.env.CLOUDMAILIN_API_KEY;
  const emailTo = process.env.SUMMARY_EMAIL_TO;
  const emailFrom = process.env.SUMMARY_EMAIL_FROM || cloudmailinUsername;

  if (!serviceUrl || !rssSecret) {
    throw new Error('READER_SERVICE_URL or RSS_SECRET environment variables are missing.');
  }
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  if (!cloudmailinUsername || !cloudmailinApiKey) {
    throw new Error('CLOUDMAILIN_USERNAME or CLOUDMAILIN_API_KEY is missing.');
  }
  if (!emailTo) {
    throw new Error('SUMMARY_EMAIL_TO is not configured.');
  }

  // 1. Fetch unread articles from the past 14 days
  const res = await fetch(`${serviceUrl}/articles?limit=200`, {
    headers: { 'X-Api-Key': rssSecret },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch articles: ${res.status}`);
  }

  const allArticles: RawArticle[] = await res.json();
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const candidates = allArticles.filter(
    (a) => a.status === 'unread' && a.received_at && new Date(a.received_at) >= fourteenDaysAgo,
  );

  if (candidates.length === 0) {
    return { status: 'skipped', reason: 'No unread articles in the past 14 days.' };
  }

  // 2. Fetch user topic preferences
  const prefs = await getUserPreferences();

  // 3. Ask Gemini to select up to 10 articles and write 3-line summaries
  const candidateList = candidates
    .sort((a, b) => new Date(b.received_at ?? 0).getTime() - new Date(a.received_at ?? 0).getTime())
    .slice(0, 80)
    .map((a) => ({
      id: a.id,
      title: a.title,
      newsletter: a.newsletter_name || '',
      url: a.url || '',
      summary: (a.summary || '').slice(0, 400),
      received_at: a.received_at,
    }));

  const prompt = `You are a research curator for an engineer who reads on their commute.

User Topic Interests:
${JSON.stringify(prefs.interested, null, 2)}

Topics to Strictly Exclude:
${JSON.stringify(prefs.excluded, null, 2)}

Candidate Articles (unread, past 14 days):
${JSON.stringify(candidateList, null, 2)}

Instructions:
1. Filter out articles matching excluded topics.
2. Select up to 10 articles that best match the user's interests. Favour variety across newsletters.
3. For each selected article, write exactly 3 punchy, informative sentences that give the engineer a clear sense of what the article covers and why it matters. Each sentence should stand alone — no filler, no padding.

Return valid JSON strictly matching:
{
  "articles": [
    {
      "id": <article id>,
      "title": "<article title>",
      "newsletter": "<newsletter name>",
      "url": "<article url or empty string>",
      "lines": ["<sentence 1>", "<sentence 2>", "<sentence 3>"]
    }
  ]
}`;

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: geminiModel,
    generationConfig: { responseMimeType: 'application/json' },
  });

  const response = await model.generateContent(prompt);
  const rawText = response.response.text() || '{}';

  let result: GeminiEmailResult;
  try {
    result = JSON.parse(rawText);
  } catch {
    return { status: 'error', reason: `Gemini returned unparseable JSON: ${rawText.slice(0, 200)}` };
  }

  if (!result.articles || result.articles.length === 0) {
    return { status: 'skipped', reason: 'Gemini found no matching articles for your interests.' };
  }

  // 4. Build and send the email
  const html = buildEmailHtml(result.articles, serviceUrl);
  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  const client = new MessageClient({ username: cloudmailinUsername, apiKey: cloudmailinApiKey });
  await client.sendMessage({
    from: emailFrom!,
    to: emailTo,
    subject: `Research Reader — ${result.articles.length} articles for ${dateLabel}`,
    html,
  });

  return { status: 'success', articleCount: result.articles.length };
}
