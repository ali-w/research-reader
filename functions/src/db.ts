import { createClient, Client } from '@libsql/client';

let dbClient: Client | null = null;

export function getTursoClient(): Client {
  if (dbClient) return dbClient;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error('TURSO_DATABASE_URL environment variable is not configured.');
  }

  dbClient = createClient({
    url,
    authToken: authToken || undefined,
  });

  return dbClient;
}

export async function initDatabase(): Promise<void> {
  const db = getTursoClient();

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      device_info TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY DEFAULT 'default',
      interested_topics TEXT DEFAULT '["AI & Agentic Systems", "Distributed Systems", "Offline-First Architectures"]',
      excluded_topics TEXT DEFAULT '["Crypto", "Celebrity News", "Politics"]',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  device_info?: string;
  created_at?: string;
}

export async function saveSubscription(payload: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  device_info?: string;
}): Promise<void> {
  const db = getTursoClient();

  await db.execute({
    sql: `INSERT INTO push_subscriptions (endpoint, p256dh, auth, device_info, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(endpoint) DO UPDATE SET
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            device_info = excluded.device_info,
            created_at = datetime('now')`,
    args: [payload.endpoint, payload.keys.p256dh, payload.keys.auth, payload.device_info || ''],
  });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const db = getTursoClient();

  await db.execute({
    sql: `DELETE FROM push_subscriptions WHERE endpoint = ?`,
    args: [endpoint],
  });
}

export async function removeSubscriptions(endpoints: string[]): Promise<void> {
  if (endpoints.length === 0) return;
  const db = getTursoClient();

  const placeholders = endpoints.map(() => '?').join(',');
  await db.execute({
    sql: `DELETE FROM push_subscriptions WHERE endpoint IN (${placeholders})`,
    args: endpoints,
  });
}

export async function getAllSubscriptions(): Promise<StoredSubscription[]> {
  const db = getTursoClient();

  const rs = await db.execute(`SELECT endpoint, p256dh, auth, device_info, created_at FROM push_subscriptions`);
  return rs.rows.map((row) => ({
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
    device_info: row.device_info ? String(row.device_info) : undefined,
    created_at: row.created_at ? String(row.created_at) : undefined,
  }));
}

export interface StoredPreferences {
  interested: string[];
  excluded: string[];
}

export async function getUserPreferences(): Promise<StoredPreferences> {
  const db = getTursoClient();

  const rs = await db.execute({
    sql: `SELECT interested_topics, excluded_topics FROM user_preferences WHERE user_id = 'default' LIMIT 1`,
    args: [],
  });

  if (rs.rows.length === 0) {
    return {
      interested: ['AI & Agentic Systems', 'Distributed Systems', 'Offline-First Architectures'],
      excluded: ['Crypto', 'Celebrity News', 'Politics'],
    };
  }

  const row = rs.rows[0];
  try {
    return {
      interested: JSON.parse(String(row.interested_topics)),
      excluded: JSON.parse(String(row.excluded_topics)),
    };
  } catch {
    return {
      interested: ['AI & Agentic Systems', 'Distributed Systems'],
      excluded: ['Crypto', 'Celebrity News'],
    };
  }
}

export async function saveUserPreferences(prefs: StoredPreferences): Promise<void> {
  const db = getTursoClient();

  await db.execute({
    sql: `INSERT INTO user_preferences (user_id, interested_topics, excluded_topics, updated_at)
          VALUES ('default', ?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            interested_topics = excluded.interested_topics,
            excluded_topics = excluded.excluded_topics,
            updated_at = datetime('now')`,
    args: [JSON.stringify(prefs.interested), JSON.stringify(prefs.excluded)],
  });
}
