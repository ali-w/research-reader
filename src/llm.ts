export const DEFAULT_SUMMARIZE_ENDPOINT =
  'https://summarize-ufwk6luuiq-ew.a.run.app/articles/[id]/summary';

export async function fetchSummaryFromEndpoint(
  articleId: string,
  endpointTemplate: string = DEFAULT_SUMMARIZE_ENDPOINT,
  apiKey: string = ''
): Promise<string> {
  const url = endpointTemplate.replace('[id]', articleId);
  const response = await fetch(url, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  return response.text();
}

export async function describeArticle(
  articleId: string,
  endpointTemplate: string,
  apiKey: string
): Promise<{ summary: string; suggestedTag: string }> {
  const origin = new URL(endpointTemplate).origin;
  const response = await fetch(`${origin}/articles/${articleId}/describe`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  return response.json();
}
