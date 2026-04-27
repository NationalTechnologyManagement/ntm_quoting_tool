import { cred } from '../services/integration-credentials.service.js';

const AP_BASE_URL = 'https://public-api.alternativepayments.io';

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getOAuthToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300_000) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(`${cred('AP_CLIENT_ID') || ''}:${cred('AP_CLIENT_SECRET') || ''}`).toString('base64');

  const res = await fetch(`${AP_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AP OAuth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  return cachedToken.token;
}

export async function apFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getOAuthToken();
  const res = await fetch(`${AP_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return res;
}

export function isAPConfigured(): boolean {
  return !!(cred('AP_CLIENT_ID') && cred('AP_CLIENT_SECRET'));
}

/** Reset cached OAuth token. Called after admin updates AP credentials. */
export function resetAPTokenCache(): void {
  cachedToken = null;
}
