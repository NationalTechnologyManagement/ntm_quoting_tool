import type { QuoteData } from '@ntm/shared';
import { SERVICE_PROVIDER } from '@ntm/shared';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Short "payment received" email — sent right after AP webhook confirms a
// charge. This is distinct from the contract email (which carries the
// signed PDF attachment + the full recap). Both used to share the same
// payment-confirmation template, which made the customer feel like they
// got two contract emails. Now this body is intentionally minimal: thanks,
// here's what was charged, here's what happens next.
export function buildPaymentReceivedHtml(quote: QuoteData): string {
  const paid =
    (quote.totals.onboardingCost || 0) +
    (quote.totals.oneTimeCosts || 0) +
    (quote.totals.recurringCosts || 0);
  const orderNumber = (quote as any).orderNumber as string | undefined;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;color:#1f2937;margin:0;padding:0;background:#f9fafb;">
  <div style="max-width:600px;margin:0 auto;background:white;">
    <div style="background:#10b981;color:white;padding:32px 30px;text-align:center;">
      <img
        src="https://seahorse-space.nyc3.cdn.digitaloceanspaces.com/website/ntm_shield.ico"
        alt="NTM"
        width="48" height="48"
        style="display:block; margin:0 auto 8px; width:48px; height:48px;"
      />
      <h1 style="margin:0;font-size:22px;">Payment Received</h1>
      <p style="margin:8px 0 0 0;opacity:0.9;font-size:14px;">
        Quote #${quote.quoteNumber}${orderNumber ? ` &nbsp;|&nbsp; Order #${orderNumber}` : ''}
      </p>
    </div>

    <div style="padding:28px 30px;">
      <p style="margin:0 0 16px 0;font-size:15px;">Hi ${quote.customer.name.split(' ')[0] || 'there'},</p>
      <p style="margin:0 0 16px 0;font-size:15px;">
        Thanks — we've received your payment of
        <strong style="color:#065f46;">${formatCurrency(paid)}</strong>
        for ${quote.customer.businessName}.
      </p>

      <div style="background:#f0fdf4;border-left:4px solid #10b981;padding:14px 18px;margin:20px 0;border-radius:4px;">
        <p style="margin:0 0 6px 0;font-weight:600;color:#065f46;">What happens next</p>
        <ul style="margin:0;padding-left:18px;color:#1f2937;font-size:14px;line-height:1.65;">
          <li>Your signed contract is attached in a separate email titled
            <em>"Your Contract — ${quote.customer.businessName}"</em>.</li>
          <li>Onboarding starts within 30 days of today.</li>
          <li>Recurring invoices are issued on the <strong>1st of every month</strong>
            and are due within <strong>30 days</strong> (Net 30).</li>
        </ul>
      </div>

      <p style="margin:16px 0 0 0;font-size:14px;color:#4b5563;">
        Questions? Reach us at
        <a href="mailto:${SERVICE_PROVIDER.email}" style="color:#0ea5e9;">${SERVICE_PROVIDER.email}</a>
        or call ${SERVICE_PROVIDER.phone}.
      </p>
    </div>

    <div style="padding:18px 30px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;text-align:center;">
      ${SERVICE_PROVIDER.company}<br/>
      ${SERVICE_PROVIDER.address}
    </div>
  </div>
</body>
</html>`;
}
