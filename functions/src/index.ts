import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import express from 'express';
import cors from 'cors';
import {
  saveSubscription,
  removeSubscription,
  getUserPreferences,
  saveUserPreferences,
} from './db.js';
import { runCurationAndPush } from './curation.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// 1. Subscribe Device
app.post('/push/subscribe', async (req, res) => {
  try {
    const { subscription, device_info } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      res.status(400).json({ error: 'Invalid subscription payload' });
      return;
    }

    await saveSubscription({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      device_info,
    });

    res.json({ success: true });
  } catch (err: unknown) {
    console.error('Error in /push/subscribe:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 2. Unsubscribe Device
app.post('/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      res.status(400).json({ error: 'Missing endpoint' });
      return;
    }

    await removeSubscription(endpoint);
    res.json({ success: true });
  } catch (err: unknown) {
    console.error('Error in /push/unsubscribe:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 3. Get User Preferences
app.get('/user/preferences', async (_req, res) => {
  try {
    const prefs = await getUserPreferences();
    res.json(prefs);
  } catch (err: unknown) {
    console.error('Error in GET /user/preferences:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 4. Update User Preferences
app.put('/user/preferences', async (req, res) => {
  try {
    const { interested, excluded } = req.body;
    await saveUserPreferences({
      interested: Array.isArray(interested) ? interested : [],
      excluded: Array.isArray(excluded) ? excluded : [],
    });

    res.json({ success: true });
  } catch (err: unknown) {
    console.error('Error in PUT /user/preferences:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 5. Test/Manual Curation Trigger
app.post('/notifications/curate-and-send', async (req, res) => {
  try {
    // Basic verification against RSS_SECRET if configured
    const expectedKey = process.env.RSS_SECRET;
    const providedKey = req.headers['x-api-key'];

    if (expectedKey && providedKey !== expectedKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await runCurationAndPush();
    res.json(result);
  } catch (err: unknown) {
    console.error('Error in /notifications/curate-and-send:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const ALL_SECRETS = [
  'GEMINI_API_KEY',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'RSS_SECRET',
  'SERVICE_URL',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
];

// HTTPS API Function
export const api = onRequest(
  {
    cors: true,
    secrets: ALL_SECRETS,
  },
  app
);

// Cloud Scheduler: Weekdays at 8:00 AM and 6:00 PM London time
export const dailyCurationCron = onSchedule(
  {
    schedule: '0 8,18 * * 1-5',
    timeZone: 'Europe/London',
    secrets: ALL_SECRETS,
  },
  async () => {
    const result = await runCurationAndPush();
    console.log('Daily curation cron completed:', result);
  }
);
