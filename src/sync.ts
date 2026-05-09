export type SyncPatch = {
  status?: 'unread' | 'read' | 'skipped';
  rating?: number | null;
  notes?: string;
};

function parseEndpoint(feedEndpoint: string): { origin: string; secret: string } {
  const url = new URL(feedEndpoint);
  return { origin: url.origin, secret: url.searchParams.get('secret') ?? '' };
}

export async function patchArticle(
  articleId: string,
  patch: SyncPatch,
  feedEndpoint: string
): Promise<void> {
  const { origin, secret } = parseEndpoint(feedEndpoint);
  const res = await fetch(
    `${origin}/articles/${articleId}?secret=${encodeURIComponent(secret)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }
  );
  if (!res.ok) throw new Error(`PATCH /articles/${articleId} failed: ${res.status}`);
}

export async function batchPatchArticles(
  updates: Array<{ id: string } & SyncPatch>,
  feedEndpoint: string
): Promise<{ succeeded: number[]; failed: Array<{ id: number; error: string }> }> {
  const { origin, secret } = parseEndpoint(feedEndpoint);
  const body = updates.map(({ id, ...patch }) => ({ id: parseInt(id, 10), ...patch }));
  const res = await fetch(
    `${origin}/articles/updates?secret=${encodeURIComponent(secret)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`POST /articles/updates failed: ${res.status}`);
  return res.json();
}
