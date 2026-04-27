// Integration credentials live in two places:
// - process env (set on Railway), the source of truth at first boot
// - integration_credentials DB table, editable from /admin/integrations
//
// The cache below is hydrated from the DB at process start. `cred(key)` is a
// synchronous lookup: DB cache → process env → undefined. Any time the admin
// UI updates a credential, `setCredential` writes the row and refreshes the
// cache so the next inbound request sees the new value without a redeploy.

import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';

/** Known credential keys — the ones the admin UI exposes. Add to this list as
 *  new integrations come online so the UI auto-discovers them. */
export const INTEGRATION_CREDENTIAL_KEYS = [
  // ConnectWise
  'CW_BASE_URL',
  'CW_COMPANY_ID',
  'CW_PUBLIC_KEY',
  'CW_PRIVATE_KEY',
  'CW_CLIENT_ID',
  // Alternative Payments
  'AP_CLIENT_ID',
  'AP_CLIENT_SECRET',
  'AP_WEBHOOK_SECRET',
  // GoHighLevel
  'GHL_API_KEY',
  'GHL_LOCATION_ID',
  // Email
  'RESEND_API_KEY',
  'FROM_EMAIL',
  // Notify + Rewst
  'NOTIFY_WEBHOOK_URL',
  'REWST_TRIGGER_URL',
  'REWST_AUTH_TOKEN',
] as const;

export type IntegrationCredentialKey = (typeof INTEGRATION_CREDENTIAL_KEYS)[number];

/** Keys that hold true secrets and should be masked in admin responses. */
const SECRET_KEYS: ReadonlySet<string> = new Set([
  'CW_PRIVATE_KEY',
  'CW_PUBLIC_KEY',
  'AP_CLIENT_SECRET',
  'AP_WEBHOOK_SECRET',
  'GHL_API_KEY',
  'RESEND_API_KEY',
  'REWST_AUTH_TOKEN',
]);

const cache = new Map<string, string>();
let initialized = false;

export async function initCredentialsCache(): Promise<void> {
  const rows = await prisma.integrationCredential.findMany();
  cache.clear();
  for (const row of rows) cache.set(row.key, row.value);
  initialized = true;
  console.log(`[creds] loaded ${rows.length} integration credentials from DB`);
}

/** Synchronous read. DB cache wins; env is the fallback. */
export function cred(key: string): string | undefined {
  if (!initialized) {
    // First-call lazy fallback: if init never ran, just hit env so we don't
    // crash. The startup hook in index.ts should have called init already.
    return (env as unknown as Record<string, string | undefined>)[key];
  }
  return cache.get(key) ?? (env as unknown as Record<string, string | undefined>)[key];
}

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key);
}

/** Mask all but the first 4 chars (or the entire value if shorter). */
export function maskValue(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(8, value.length - 4))}`;
}

interface CredentialRow {
  key: string;
  value: string;       // empty string when not set anywhere
  source: 'db' | 'env' | 'unset';
  masked: boolean;     // true = `value` is a masked preview, not the real secret
  notes: string | null;
}

export async function getAllCredentials(reveal = false): Promise<CredentialRow[]> {
  const rows = await prisma.integrationCredential.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r] as const));

  return INTEGRATION_CREDENTIAL_KEYS.map((key) => {
    const dbRow = byKey.get(key);
    const envVal = (env as unknown as Record<string, string | undefined>)[key];
    let raw: string;
    let source: 'db' | 'env' | 'unset';
    if (dbRow?.value) {
      raw = dbRow.value;
      source = 'db';
    } else if (envVal) {
      raw = envVal;
      source = 'env';
    } else {
      raw = '';
      source = 'unset';
    }
    const secret = isSecretKey(key);
    const masked = !reveal && secret && raw.length > 0;
    return {
      key,
      value: masked ? maskValue(raw) : raw,
      source,
      masked,
      notes: dbRow?.notes ?? null,
    };
  });
}

export async function setCredential(
  key: IntegrationCredentialKey,
  value: string,
  notes: string | null = null,
): Promise<void> {
  await prisma.integrationCredential.upsert({
    where: { key },
    update: { value, notes },
    create: { key, value, notes },
  });
  cache.set(key, value);
}

export async function deleteCredential(key: IntegrationCredentialKey): Promise<void> {
  await prisma.integrationCredential.delete({ where: { key } }).catch(() => {});
  cache.delete(key);
}

export function isCredentialKey(key: string): key is IntegrationCredentialKey {
  return (INTEGRATION_CREDENTIAL_KEYS as readonly string[]).includes(key);
}
