import { getResend } from '../config/resend.js';
import { cred } from './integration-credentials.service.js';
import { env } from '../config/env.js';
import type { QuoteData } from '@ntm/shared';
import { buildQuoteEmailHtml } from '../templates/quote-email.js';
import { buildPaymentConfirmationHtml } from '../templates/payment-confirmation.js';

const fromEmail = () => cred('FROM_EMAIL') || env.FROM_EMAIL;

export async function sendQuoteEmail(quote: QuoteData) {
  const resend = getResend();
  if (!resend) {
    console.warn('[Email] Resend not configured — skipping quote email');
    return { success: true, skipped: true };
  }

  const quoteUrl = `${env.FRONTEND_URL}/quote-review?id=${quote.quoteNumber}`;
  const html = buildQuoteEmailHtml(quote, quoteUrl);

  const result = await resend.emails.send({
    from: fromEmail(),
    to: quote.customer.email,
    subject: `Your Quote #${quote.quoteNumber} - ${quote.customer.businessName}`,
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

  const result = await resend.emails.send({
    from: fromEmail(),
    to: quote.customer.email,
    subject: `Your Contract - ${quote.customer.businessName} (${quote.quoteNumber})`,
    html,
    attachments: [
      {
        filename: `Contract-${quote.quoteNumber}.pdf`,
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

  const html = buildPaymentConfirmationHtml(quote);

  const result = await resend.emails.send({
    from: fromEmail(),
    to: quote.customer.email,
    subject: `Payment Confirmed - ${quote.customer.businessName}`,
    html,
  });

  return { success: true, id: result.data?.id };
}
