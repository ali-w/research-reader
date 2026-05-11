export type SyncPatch = {
  status?: 'unread' | 'read' | 'skipped' | 'later';
  saved?: boolean;
  rating?: number | null;
  notes?: string;
  tags?: string[];
};

export async function patchArticle(
  articleId: string,
  patch: SyncPatch,
  feedEndpoint: string,
  apiKey: string
): Promise<void> {
  const res = await fetch(`${feedEndpoint}/articles/${articleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH /articles/${articleId} failed: ${res.status}`);
}

export async function createArticle(
  payload: {
    title: string;
    url: string;
    summary?: string;
    tags?: string[];
    content_type?: string;
    saved?: boolean;
  },
  feedEndpoint: string,
  apiKey: string
): Promise<{ id: number }> {
  const res = await fetch(`${feedEndpoint}/articles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST /articles failed: ${res.status}`);
  return res.json();
}

export async function initiatePdfUpload(
  payload: {
    title: string;
    pdfType: 'typed' | 'handwritten';
    extractOcr: boolean;
    tags?: string[];
    summary?: string;
  },
  feedEndpoint: string,
  apiKey: string
): Promise<{ id: number; upload_url: string; gcs_uri: string }> {
  const res = await fetch(`${feedEndpoint}/articles/upload-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({
      title: payload.title,
      pdf_type: payload.pdfType,
      extract_ocr: payload.extractOcr,
      tags: payload.tags,
      summary: payload.summary,
      saved: true,
    }),
  });
  if (!res.ok) throw new Error(`POST /articles/upload-pdf failed: ${res.status}`);
  return res.json();
}

export async function confirmPdfUpload(
  id: number,
  gcsUri: string,
  feedEndpoint: string,
  apiKey: string
): Promise<void> {
  const res = await fetch(`${feedEndpoint}/articles/${id}/confirm-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({ gcs_uri: gcsUri }),
  });
  if (!res.ok) throw new Error(`POST /articles/${id}/confirm-upload failed: ${res.status}`);
}

export async function deepSearch(
  query: string,
  feedEndpoint: string,
  apiKey: string,
  type: 'all' | 'pdf' | 'cached' = 'all'
): Promise<Array<{ id: number; title: string }>> {
  const params = new URLSearchParams({ q: query, pdfs: 'true', type });
  const res = await fetch(`${feedEndpoint}/articles/search?${params}`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) throw new Error(`GET /articles/search failed: ${res.status}`);
  const data: { results: Array<{ id: number; title: string }> } = await res.json();
  return data.results;
}

export async function deleteArticleRemote(
  id: string,
  feedEndpoint: string,
  apiKey: string
): Promise<void> {
  const res = await fetch(`${feedEndpoint}/articles/${id}`, {
    method: 'DELETE',
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE /articles/${id} failed: ${res.status}`);
}

export async function batchPatchArticles(
  updates: Array<{ id: string } & SyncPatch>,
  feedEndpoint: string,
  apiKey: string
): Promise<{ succeeded: number[]; failed: Array<{ id: number; error: string }> }> {
  const body = updates.map(({ id, ...patch }) => ({ id: parseInt(id, 10), ...patch }));
  const res = await fetch(`${feedEndpoint}/articles/updates`, {
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
