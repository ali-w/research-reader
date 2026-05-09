export const DEFAULT_SUMMARIZE_ENDPOINT =
  'https://newsletter-processor-660809700014.europe-west2.run.app/summarize/[id]?secret=AliWAliW';

export async function fetchSummaryFromEndpoint(
  articleId: string,
  endpointTemplate: string = DEFAULT_SUMMARIZE_ENDPOINT
): Promise<string> {
  const url = endpointTemplate.replace('[id]', articleId);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  return response.text();
}
