// Slack/Teams notifications for provisioning lifecycle events PLUS
// detailed email alerts to support@trustntm.com when a step fails.
// Webhook URL is configured via env (NOTIFY_WEBHOOK_URL); empty = no-op.
// Email goes through Resend (same client the customer-facing emails use).

import { cred } from './integration-credentials.service.js';
import { getResend } from '../config/resend.js';
import { prisma } from '../config/prisma.js';

const LOGS_FROM_EMAIL = 'NTM Quote Logs <logs@trustntm.com>';
const LOGS_TO_EMAIL = 'support@trustntm.com';

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
  const url = cred('NOTIFY_WEBHOOK_URL');
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

// ── Detailed provisioning-step failure logger ────────────────────────
// Called by the CW orchestrator any time a step throws. Writes to AuditLog
// for the admin Provisioning Errors view AND emails support@trustntm.com
// with the full payload so ops can dig in without opening Railway logs.

export interface ProvisioningStepFailurePayload {
  quoteNumber: string;
  businessName: string;
  customerEmail?: string;
  step: string;
  error: string;
  stack?: string;
  // Anything else useful (CW ids resolved so far, retry counts, etc.).
  context?: Record<string, unknown>;
}

export async function logProvisioningStepFailure(
  p: ProvisioningStepFailurePayload,
): Promise<void> {
  // 1. AuditLog row (drives the admin Provisioning Errors page).
  try {
    await prisma.auditLog.create({
      data: {
        action: 'provisioning_step_failed',
        entity: 'quote',
        entityId: p.quoteNumber,
        data: {
          step: p.step,
          error: p.error,
          stack: p.stack ?? null,
          businessName: p.businessName,
          customerEmail: p.customerEmail ?? null,
          ...(p.context ?? {}),
        } as any,
      },
    });
  } catch (err) {
    console.error('[notify] AuditLog write failed:', err);
  }

  // 2. Slack/Teams webhook (best-effort).
  await postWebhook(
    [
      `🚨 *CW provisioning step failed*`,
      `• Quote: ${p.quoteNumber} — ${p.businessName}`,
      `• Step: ${p.step}`,
      `• Error: ${p.error}`,
    ].join('\n'),
  );

  // 3. Email to support@trustntm.com from logs@trustntm.com.
  const resend = getResend();
  if (!resend) {
    console.warn('[notify] Resend not configured — skipping ops email');
    return;
  }
  const ctxLines = p.context
    ? Object.entries(p.context).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    : [];
  const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, Segoe UI, Helvetica, sans-serif; color:#222; max-width:640px; margin:0 auto; padding:24px;">
  <h2 style="margin-bottom:4px;">CW provisioning step failed</h2>
  <p style="color:#666; margin-top:0;">Quote <strong>${escapeHtml(p.quoteNumber)}</strong> — ${escapeHtml(p.businessName)}</p>
  <table style="border-collapse:collapse; width:100%; margin-top:16px;">
    <tr><td style="padding:6px 8px; background:#f4f4f4; font-weight:600;">Step</td><td style="padding:6px 8px; border:1px solid #eee;">${escapeHtml(p.step)}</td></tr>
    <tr><td style="padding:6px 8px; background:#f4f4f4; font-weight:600;">Error</td><td style="padding:6px 8px; border:1px solid #eee;">${escapeHtml(p.error)}</td></tr>
    ${p.customerEmail ? `<tr><td style="padding:6px 8px; background:#f4f4f4; font-weight:600;">Customer</td><td style="padding:6px 8px; border:1px solid #eee;">${escapeHtml(p.customerEmail)}</td></tr>` : ''}
  </table>
  ${ctxLines.length ? `<h3 style="margin-top:20px;">Context</h3><pre style="background:#fafafa; border:1px solid #eee; padding:12px; font-size:12px; overflow-x:auto;">${escapeHtml(ctxLines.join('\n'))}</pre>` : ''}
  ${p.stack ? `<h3 style="margin-top:20px;">Stack</h3><pre style="background:#fafafa; border:1px solid #eee; padding:12px; font-size:11px; overflow-x:auto;">${escapeHtml(p.stack)}</pre>` : ''}
  <p style="color:#888; font-size:12px; margin-top:20px;">Sent automatically by the NTM quoting tool. View this quote in the admin portal to retry provisioning or inspect the step history.</p>
</body></html>`;

  try {
    await resend.emails.send({
      from: LOGS_FROM_EMAIL,
      to: LOGS_TO_EMAIL,
      subject: `[CW failure] ${p.quoteNumber} — ${p.businessName} — ${p.step}`,
      html,
    });
  } catch (err) {
    console.error('[notify] support email send failed:', err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
