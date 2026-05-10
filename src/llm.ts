export const DEFAULT_SUMMARIZE_ROOT =
  'https://summarize-ufwk6luuiq-ew.a.run.app';

export async function fetchSummaryFromEndpoint(
  articleId: string,
  summarizeRoot: string = DEFAULT_SUMMARIZE_ROOT,
  apiKey: string = ''
): Promise<string> {
  const response = await fetch(`${summarizeRoot}/articles/${articleId}/summary`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  return response.text();
}

export async function describeArticle(
  articleId: string,
  summarizeRoot: string,
  apiKey: string
): Promise<{ summary: string; suggestedTag: string }> {
  const response = await fetch(`${summarizeRoot}/articles/${articleId}/describe`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  return response.json();
}
