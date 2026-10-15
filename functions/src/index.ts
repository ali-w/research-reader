import express from 'express';
import cors from 'cors';
import {
  initDatabase,
  saveSubscription,
  removeSubscription,
  getUserPreferences,
  saveUserPreferences,
} from './db.js';
import { runCurationAndPush } from './curation.js';

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// Health Check for Cloud Run
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'research-reader-curator' });
});

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'research-reader-curator' });
});

// 1. Subscribe Device (from Android WebAPK)
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

// 3. Get User Topic Preferences
app.get('/user/preferences', async (_req, res) => {
  try {
    const prefs = await getUserPreferences();
    res.json(prefs);
  } catch (err: unknown) {
    console.error('Error in GET /user/preferences:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 4. Update User Topic Preferences
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

// 5. Curation & Push Trigger (Invoked by Cloud Scheduler or manual test)
app.post('/notifications/curate-and-send', async (req, res) => {
  try {
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

const port = process.env.PORT || 8080;

await initDatabase();
app.listen(port, () => {
  console.log(`Research Reader Curator service listening on port ${port}`);
});
