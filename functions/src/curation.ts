import webpush from 'web-push';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  getAllSubscriptions,
  getUserPreferences,
  removeSubscriptions,
} from './db.js';

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

interface CuratedResult {
  selected_id: string | number;
  notification_title: string;
  notification_summary: string;
  reason?: string;
}

export async function runCurationAndPush(): Promise<{
  status: string;
  articleId?: string;
  title?: string;
  summary?: string;
  sentCount?: number;
  reason?: string;
}> {
  const serviceUrl = process.env.READER_SERVICE_URL;
  const rssSecret = process.env.RSS_SECRET;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@researchreader.app';

  if (!serviceUrl || !rssSecret) {
    throw new Error('READER_SERVICE_URL or RSS_SECRET environment variables are missing.');
  }
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is missing.');
  }

  // 1. Fetch Candidate Articles from Reader API
  const res = await fetch(`${serviceUrl}/articles?limit=200`, {
    headers: { 'X-Api-Key': rssSecret },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch articles from ${serviceUrl}: ${res.status}`);
  }

  const allArticles: RawArticle[] = await res.json();
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // Eligible pool:
  // - Flagged for 'later' (regardless of age)
  // - Unread received in the past 14 days
  const candidates = allArticles.filter((a) => {
    const isLater = a.status === 'later' || (Array.isArray(a.tags) && a.tags.includes('later'));
    if (isLater) return true;

    if (a.status === 'unread' && a.received_at) {
      return new Date(a.received_at) >= fourteenDaysAgo;
    }
    return false;
  });

  if (candidates.length === 0) {
    return { status: 'skipped', reason: 'No eligible unread or later candidate articles.' };
  }

  // 2. Fetch User Topic Preferences
  const prefs = await getUserPreferences();

  // 3. Prompt Gemini for Curation
  // Sort: 'later'-tagged articles first (user bookmarked them), then most recent
  const sortedCandidates = [...candidates].sort((a, b) => {
    const aIsLater = a.status === 'later' || (Array.isArray(a.tags) && a.tags.includes('later'));
    const bIsLater = b.status === 'later' || (Array.isArray(b.tags) && b.tags.includes('later'));
    if (aIsLater !== bIsLater) return aIsLater ? -1 : 1;
    return new Date(b.received_at ?? 0).getTime() - new Date(a.received_at ?? 0).getTime();
  });

  const candidateSummaries = sortedCandidates.slice(0, 50).map((a) => ({
    id: a.id,
    title: a.title,
    newsletter: a.newsletter_name || '',
    tags: a.tags || [],
    status: a.status,
    summary: (a.summary || '').slice(0, 300),
  }));

  const prompt = `You are a research curator for an engineer.
Current context: Daily reading notification for Android lock screen.

User Topic Interests:
${JSON.stringify(prefs.interested, null, 2)}

Topics to Strictly Exclude:
${JSON.stringify(prefs.excluded, null, 2)}

Candidate Articles (Pool: unread from past 14 days + articles tagged for later):
${JSON.stringify(candidateSummaries, null, 2)}

Instructions:
1. Filter out candidate articles matching excluded topics.
2. Prioritize articles aligning with user interests.
3. Select the SINGLE most rewarding article to read right now.
4. Generate a notification title (max 40 chars).
5. Generate a punchy, high-signal notification summary hook (UNDER 120 CHARACTERS) tailored for an Android notification tray.

Return valid JSON strictly matching:
{
  "selected_id": <article id>,
  "notification_title": "<concise title, max 40 chars>",
  "notification_summary": "<hook, max 120 chars>",
  "reason": "<short 1-sentence curation rationale>"
}`;

  const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: geminiModel,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const response = await model.generateContent(prompt);
  const rawText = response.response.text() || '{}';

  let curated: CuratedResult;
  try {
    curated = JSON.parse(rawText);
  } catch {
    return { status: 'error', reason: `Gemini returned unparseable JSON: ${rawText.slice(0, 200)}` };
  }

  if (!curated.selected_id) {
    return { status: 'error', reason: 'Gemini did not return a valid article id.' };
  }

  const selectedArticleId = String(curated.selected_id);
  const notificationTitle = curated.notification_title || 'Article of the Day';
  const notificationSummary = curated.notification_summary || 'Curated article to read today.';

  // 4. Construct Push Payload
  const pushPayload = JSON.stringify({
    title: notificationTitle,
    summary: notificationSummary,
    articleId: selectedArticleId,
    apiRoot: serviceUrl,
    apiKey: rssSecret,
    tag: 'daily-curation',
  });

  // 5. Send Web Push to Registered Devices
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const subscriptions = await getAllSubscriptions();
  if (subscriptions.length === 0) {
    return {
      status: 'no_subscriptions',
      articleId: selectedArticleId,
      title: notificationTitle,
      summary: notificationSummary,
    };
  }

  const staleEndpoints: string[] = [];
  let sentCount = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        pushPayload,
        { TTL: 3600 }
      );
      sentCount++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        staleEndpoints.push(sub.endpoint);
      } else {
        console.warn(`Failed to push to ${sub.endpoint}:`, err);
      }
    }
  }

  // Clean up expired subscriptions
  if (staleEndpoints.length > 0) {
    await removeSubscriptions(staleEndpoints);
  }

  return {
    status: 'success',
    articleId: selectedArticleId,
    title: notificationTitle,
    summary: notificationSummary,
    sentCount,
  };
}
