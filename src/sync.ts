export type SyncPatch = {
  status?: 'unread' | 'read' | 'skipped';
  saved?: boolean;
  rating?: number | null;
  notes?: string;
  tags?: string[];
};

function baseUrl(feedEndpoint: string): string {
  return new URL(feedEndpoint).origin;
}

export async function patchArticle(
  articleId: string,
  patch: SyncPatch,
  feedEndpoint: string,
  apiKey: string
): Promise<void> {
  const res = await fetch(`${baseUrl(feedEndpoint)}/articles/${articleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH /articles/${articleId} failed: ${res.status}`);
}

export async function batchPatchArticles(
  updates: Array<{ id: string } & SyncPatch>,
  feedEndpoint: string,
  apiKey: string
): Promise<{ succeeded: number[]; failed: Array<{ id: number; error: string }> }> {
  const body = updates.map(({ id, ...patch }) => ({ id: parseInt(id, 10), ...patch }));
  const res = await fetch(`${baseUrl(feedEndpoint)}/articles/updates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /articles/updates failed: ${res.status}`);

  const results: Array<{ id: number; updated_at: string }> = await res.json();
  const succeededSet = new Set(results.map((r) => r.id));
  const succeeded = body.map((u) => u.id).filter((id) => succeededSet.has(id));
  const failed = body
    .map((u) => u.id)
    .filter((id) => !succeededSet.has(id))
    .map((id) => ({ id, error: 'Not updated by server' }));

  return { succeeded, failed };
}
