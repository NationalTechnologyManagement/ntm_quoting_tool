import { getResend } from '../config/resend.js';
import { cred } from './integration-credentials.service.js';
import { env } from '../config/env.js';
import type { QuoteData } from '@ntm/shared';
import { buildQuoteEmailHtml } from '../templates/quote-email.js';
import { buildPaymentConfirmationHtml } from '../templates/payment-confirmation.js';
import { buildPaymentReceivedHtml } from '../templates/payment-received.js';
import { buildQuoteFollowupHtml } from '../templates/quote-followup.js';
import { buildAdminInviteHtml, buildLoginCodeHtml } from '../templates/admin-invite.js';

const fromEmail = () => cred('FROM_EMAIL') || env.FROM_EMAIL;

function dedupeEmails(values: (string | undefined | null)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export interface QuoteEmailOptions {
  /** Extra recipients on the To: line (e.g. additional decision-makers). */
  additionalTo?: string[];
  /** CC recipients (e.g. assigned sales rep). */
  cc?: string[];
}

export async function sendQuoteEmail(quote: QuoteData, options: QuoteEmailOptions = {}) {
  const resend = getResend();
  if (!resend) {
    console.warn('[Email] Resend not configured — skipping quote email');
    return { success: true, skipped: true };
  }

  const quoteUrl = `${env.FRONTEND_URL}/quote-review?id=${quote.quoteNumber}`;
  const leadGen = env.LEAD_GEN_MODE;
  const bookingUrl = leadGen
    ? env.GHL_BOOKING_URL || 'https://api.leadconnectorhq.com/widget/booking/snhTg4zQQSVrJ9R3jisc'
    : undefined;
  const html = buildQuoteEmailHtml(quote, quoteUrl, { leadGen, bookingUrl });

  const docNoun = leadGen ? 'Estimate' : 'Quote';
  const to = dedupeEmails([quote.customer.email, ...(options.additionalTo ?? [])]);
  const cc = dedupeEmails(options.cc ?? []).filter(
    (addr) => !to.some((t) => t.toLowerCase() === addr.toLowerCase()),
  );

  const result = await resend.emails.send({
    from: fromEmail(),
    to,
    cc: cc.length ? cc : undefined,
    subject: `Your ${docNoun} #${quote.quoteNumber} - ${quote.customer.businessName}`,
    html,
  });

  return { success: true, id: result.data?.id, to, cc };
}

export async function sendQuoteFollowupEmail(quote: QuoteData) {
  const resend = getResend();
  if (!resend) {
    console.warn('[Email] Resend not configured — skipping followup email');
    return { success: true, skipped: true };
  }

  const quoteUrl = `${env.FRONTEND_URL}/quote-review?id=${quote.quoteNumber}`;
  const bookingUrl =
    cred('GHL_BOOKING_URL') ||
    env.GHL_BOOKING_URL ||
    'https://api.leadconnectorhq.com/widget/booking/snhTg4zQQSVrJ9R3jisc';

  const html = buildQuoteFollowupHtml(quote, quoteUrl, bookingUrl);

  const result = await resend.emails.send({
    from: fromEmail(),
    to: quote.customer.email,
    subject: `Still interested? Your quote #${quote.quoteNumber} expires soon`,
    html,
  });

  return { success: true, id: result.data?.id };
}

export async function sendContractEmail(
  quote: QuoteData,
  pdfBuffer: Buffer,
  paymentUrl?: string,
) {
  const resend = getResend();
  if (!resend) {
    console.warn('[Email] Resend not configured — skipping contract email');
    return { success: true, skipped: true };
  }

  const html = buildPaymentConfirmationHtml(quote, paymentUrl);

  // Existing customers get "Service Addition" naming so the email + attached
  // PDF can't be mistaken for a replacement of their current contract.
  const isExisting = !!quote.isExistingCustomer;
  const result = await resend.emails.send({
    from: fromEmail(),
    to: quote.customer.email,
    subject: isExisting
      ? `Your Service Addition - ${quote.customer.businessName} (${quote.quoteNumber})`
      : `Your Contract - ${quote.customer.businessName} (${quote.quoteNumber})`,
    html,
    attachments: [
      {
        filename: isExisting
          ? `Service-Addition-${quote.quoteNumber}.pdf`
          : `Contract-${quote.quoteNumber}.pdf`,
        content: pdfBuffer,
      },
    ],
  });

  return { success: true, id: result.data?.id };
}

export async function sendPaymentConfirmationEmail(quote: QuoteData) {
  const resend = getResend();
  if (!resend) {
    console.warn('[Email] Resend not configured — skipping payment confirmation');
    return { success: true, skipped: true };
  }

  // Short "payment received" body. The full recap + signed PDF go in the
  // separate Contract email via sendContractEmail. Sharing
  // buildPaymentConfirmationHtml here made the customer feel like they
  // got two contract emails — fixed by giving each call its own template.
  const html = buildPaymentReceivedHtml(quote);

  const result = await resend.emails.send({
    from: fromEmail(),
    to: quote.customer.email,
    subject: `Payment Received — ${quote.customer.businessName}`,
    html,
  });

  return { success: true, id: result.data?.id };
}

// Admin-portal invite (new staff joining the team).
export async function sendAdminInviteEmail(opts: {
  inviteeEmail: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn('[Email] Resend not configured — skipping admin invite email');
    return { success: true, skipped: true };
  }

  const html = buildAdminInviteHtml(opts);
  const result = await resend.emails.send({
    from: fromEmail(),
    to: opts.inviteeEmail,
    subject: `You're invited to the NTM admin portal`,
    html,
  });
  return { success: true, id: result.data?.id };
}

// 2FA email code (for users who chose 'email' over TOTP).
export async function sendLoginCodeEmail(opts: {
  email: string;
  code: string;
  expiresInMinutes: number;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn('[Email] Resend not configured — skipping login code email');
    return { success: true, skipped: true };
  }

  const html = buildLoginCodeHtml(opts);
  const result = await resend.emails.send({
    from: fromEmail(),
    to: opts.email,
    subject: `NTM login code: ${opts.code}`,
    html,
  });
  return { success: true, id: result.data?.id };
}
