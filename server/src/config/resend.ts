import { Resend } from 'resend';
import { cred } from '../services/integration-credentials.service.js';

// Cached client keyed by the API-key value so updates from the admin UI take
// effect on the next call (resetting the cache when the key changes).
let cached: { key: string; client: Resend } | null = null;

/** Returns a Resend client if a key is configured (env or DB), else null. */
export function getResend(): Resend | null {
  const key = cred('RESEND_API_KEY');
  if (!key) {
    cached = null;
    return null;
  }
  if (cached && cached.key === key) return cached.client;
  cached = { key, client: new Resend(key) };
  return cached.client;
}
