import type { QuoteData } from '@ntm/shared';
import { SERVICE_PROVIDER } from '@ntm/shared';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function buildPaymentConfirmationHtml(
  quote: QuoteData,
  paymentUrl?: string,
): string {
  const dueToday = quote.totals.onboardingCost + quote.totals.oneTimeCosts;

  const paymentSection = paymentUrl
    ? `
      <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
        <h3 style="margin:0 0 8px 0;color:#92400e;font-size:18px;">Action Required: Complete Your Payment</h3>
        <p style="margin:0 0 16px 0;color:#78350f;font-size:14px;">Please complete your payment to activate your services.</p>
        <a href="${paymentUrl}" style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;">Complete Payment Now</a>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;color:#1f2937;margin:0;padding:0;background:#f9fafb;">
  <div style="max-width:600px;margin:0 auto;background:white;">
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:40px 30px;text-align:center;">
      <img
        src="https://seahorse-space.nyc3.cdn.digitaloceanspaces.com/website/ntm_shield.ico"
        alt="NTM"
        width="56" height="56"
        style="display:block; margin:0 auto 12px; width:56px; height:56px;"
      />
      <h1 style="margin:0 0 10px 0;font-size:24px;">Welcome to National Technology Management!</h1>
      <p style="margin:0;opacity:0.9;">Quote #${quote.quoteNumber}${quote.agreement ? ` | Order #${(quote as any).orderNumber || ''}` : ''}</p>
    </div>
    <div style="padding:32px 30px;">
      <p>Hi ${quote.customer.name},</p>
      <p>Thank you for choosing <strong>${SERVICE_PROVIDER.company}</strong> for your technology management needs. Your contract is attached to this email as a PDF.</p>
      ${paymentSection}
      <div style="background:#f3f4f6;border-radius:8px;padding:20px;margin:24px 0;">
        <h3 style="margin:0 0 12px 0;font-size:16px;">What Happens Next</h3>
        <ol style="margin:0;padding-left:20px;">
          ${paymentUrl ? '<li>Complete your payment using the link above</li>' : '<li>Your payment has been confirmed</li>'}
          <li>Someone from our team will reach out soon to begin the onboarding process with you</li>
          <li>We\'ll work with you to schedule implementation and training</li>
        </ol>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:24px 0;">
        <p style="margin:0 0 8px 0;font-weight:600;">Contact Us</p>
        <p style="margin:4px 0;font-size:14px;">Email: ${SERVICE_PROVIDER.email}</p>
        <p style="margin:4px 0;font-size:14px;">Phone: ${SERVICE_PROVIDER.phone}</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:20px 30px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="color:#6b7280;font-size:12px;margin:0;">${SERVICE_PROVIDER.company} | ${SERVICE_PROVIDER.address}</p>
    </div>
  </div>
</body>
</html>`;
}
