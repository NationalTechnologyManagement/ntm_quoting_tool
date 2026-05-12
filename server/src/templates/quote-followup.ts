import type { QuoteData } from '@ntm/shared';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

// 30-day nudge for unpaid quotes. Keeps the body short — the customer
// already has the full quote PDF; this email is a reminder, not a re-pitch.
export function buildQuoteFollowupHtml(
  quote: QuoteData,
  quoteUrl: string,
  bookingUrl: string,
): string {
  const monthly = quote.totals.recurringCosts || 0;
  const customerFirstName = (quote.customer.name || '').split(' ')[0] || 'there';
  const pkgName = quote.selectedPackage?.name || 'your selected package';
  const businessName = quote.customer.businessName || '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Still interested in your NTM quote?</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f4f4f5;color:#0f172a;line-height:1.55;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:#0f172a;color:#ffffff;padding:20px 24px;">
              <h1 style="margin:0;font-size:20px;letter-spacing:.3px;">Quick check-in on your quote</h1>
              <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Quote #${quote.quoteNumber}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;">Hi ${customerFirstName},</p>
              <p style="margin:0 0 12px;">
                It's been about 30 days since we put together quote
                <strong>#${quote.quoteNumber}</strong>${businessName ? ` for <strong>${businessName}</strong>` : ''}
                — <strong>${pkgName}</strong> at <strong>${formatCurrency(monthly)}/month</strong>.
                We wanted to check in and make sure you didn't miss it.
              </p>
              <p style="margin:0 0 12px;">
                <strong>Heads up:</strong> our quotes are valid for 30 days, so the pricing on this
                one is about to roll off. If you'd like to lock in the price you were quoted,
                you can finish checkout from the same link below.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <a href="${quoteUrl}"
                       style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">
                      Review &amp; lock in this quote
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 12px;">
                Not ready to move forward yet, or want to talk it over with a real human?
                Grab a time with one of our sales reps and we'll walk you through it —
                no pressure, no upsell:
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 22px;">
                <tr>
                  <td align="center">
                    <a href="${bookingUrl}"
                       style="display:inline-block;background:#ffffff;color:#0f766e;border:1.5px solid #0f766e;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">
                      Schedule a call with a sales rep
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px;">Either way, just reply to this email if you have questions — we're happy to help.</p>
              <p style="margin:0 0 0;">— The NTM Team</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;color:#64748b;padding:14px 24px;font-size:12px;border-top:1px solid #e5e7eb;">
              You're receiving this because you requested a quote from NTM.
              If you'd rather not get a follow-up, just reply with "no thanks" and we'll stop.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
