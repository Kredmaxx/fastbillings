/** Minimal fetch helper for GST vendor adapters (Node 18+ global fetch). */

export class GstProviderHttpError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = 'GstProviderHttpError';
    this.status = status;
    this.body = body;
  }
}

export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new GstProviderHttpError(
      `GST provider HTTP ${res.status}: ${text.slice(0, 400)}`,
      res.status,
      text,
    );
  }
  return json;
}

export function requireCreds(
  config: Record<string, unknown> | null | undefined,
  keys: string[],
  providerLabel: string,
): void {
  if (!config) {
    throw new Error(`${providerLabel}: configure credentials in Settings → GST compliance`);
  }
  for (const key of keys) {
    const v = config[key];
    if (typeof v !== 'string' || !v.trim()) {
      throw new Error(`${providerLabel}: missing credential "${key}"`);
    }
  }
  if (typeof config.baseUrl !== 'string' || !String(config.baseUrl).trim()) {
    throw new Error(`${providerLabel}: baseUrl is required (sandbox or production API root)`);
  }
}
