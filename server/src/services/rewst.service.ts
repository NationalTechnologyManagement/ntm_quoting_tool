// Rewst trigger — kicks off the onboarding workflow once CW objects exist.
// URL is set via env REWST_TRIGGER_URL (and optionally REWST_AUTH_TOKEN).
// No-op when unset so dev/staging don't fire production workflows.

import { env } from '../config/env.js';

interface OnboardingPayload {
  quoteNumber: string;
  cwCompanyId: number | null;
  cwAgreementId: number | null;
  cwProjectId: number | null;
}

export async function triggerOnboarding(p: OnboardingPayload): Promise<void> {
  const url = env.REWST_TRIGGER_URL;
  if (!url) return;

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (env.REWST_AUTH_TOKEN) headers.Authorization = `Bearer ${env.REWST_AUTH_TOKEN}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(p),
    });
    if (!res.ok) {
      console.error(`[rewst] trigger returned ${res.status}: ${await res.text().catch(() => '')}`);
    }
  } catch (e) {
    console.error('[rewst] trigger failed:', e);
  }
}
