// Slack/Teams notifications for provisioning lifecycle events.
// Webhook URL is configured via env (NOTIFY_WEBHOOK_URL). Empty / unset = no-op.

import { env } from '../config/env.js';

interface ProvisionedPayload {
  quoteNumber: string;
  businessName: string;
  packageName: string;
  cwCompanyId: number | null;
  cwAgreementId: number | null;
  cwProjectId: number | null;
}

interface FailedPayload {
  quoteNumber: string;
  businessName: string;
  step: string;
  error: string;
}

async function postWebhook(text: string, blocks?: unknown): Promise<void> {
  const url = env.NOTIFY_WEBHOOK_URL;
  if (!url) return; // no-op when not configured

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Slack and Teams both accept { text } at minimum. Slack also accepts
      // 'blocks'; Teams ignores unknown keys.
      body: JSON.stringify({ text, ...(blocks ? { blocks } : {}) }),
    });
  } catch (e) {
    console.error('[notify] webhook post failed:', e);
  }
}

export async function notifyProvisioned(p: ProvisionedPayload): Promise<void> {
  const lines = [
    `✅ *Quote provisioned in CW*`,
    `• Quote: ${p.quoteNumber} — ${p.businessName}`,
    `• Package: ${p.packageName}`,
    `• Company: ${p.cwCompanyId ?? '—'}`,
    `• Agreement: ${p.cwAgreementId ?? '—'}`,
    `• Project: ${p.cwProjectId ?? '—'}`,
  ];
  await postWebhook(lines.join('\n'));
}

export async function notifyProvisioningFailed(p: FailedPayload): Promise<void> {
  const text = [
    `🚨 *CW provisioning failed — needs attention*`,
    `• Quote: ${p.quoteNumber} — ${p.businessName}`,
    `• Step: ${p.step}`,
    `• Error: ${p.error}`,
  ].join('\n');
  await postWebhook(text);
}
