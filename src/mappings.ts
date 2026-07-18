import { EmailTagMapping } from './types';

interface ApiEmailTagMapping {
  id: number;
  email: string;
  tag: string;
  created_at: string;
}

function fromApi(m: ApiEmailTagMapping): EmailTagMapping {
  return { id: m.id, email: m.email, tag: m.tag, createdAt: m.created_at };
}

export async function fetchEmailTagMappings(
  feedEndpoint: string,
  apiKey: string
): Promise<EmailTagMapping[]> {
  const res = await fetch(`${feedEndpoint}/email-tag-mappings`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) throw new Error(`GET /email-tag-mappings failed: ${res.status}`);
  const data: { mappings: ApiEmailTagMapping[] } = await res.json();
  return data.mappings.map(fromApi);
}

export async function upsertEmailTagMapping(
  payload: { email: string; tag: string },
  feedEndpoint: string,
  apiKey: string
): Promise<EmailTagMapping> {
  const res = await fetch(`${feedEndpoint}/email-tag-mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST /email-tag-mappings failed: ${res.status}`);
  const data: { mapping: ApiEmailTagMapping } = await res.json();
  return fromApi(data.mapping);
}

export async function deleteEmailTagMapping(
  id: number,
  feedEndpoint: string,
  apiKey: string
): Promise<void> {
  const res = await fetch(`${feedEndpoint}/email-tag-mappings/${id}`, {
    method: 'DELETE',
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) throw new Error(`DELETE /email-tag-mappings/${id} failed: ${res.status}`);
}

export function slugifyTag(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}
