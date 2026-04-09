import type { QuoteData } from '@ntm/shared';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

export function buildQuoteEmailHtml(quote: QuoteData, quoteUrl: string): string {
  const dueToday = quote.totals.onboardingCost + quote.totals.oneTimeCosts;
  const formattedDate = formatDate(quote.timestamp);
  const formattedDateTime = formatDateTime(quote.timestamp);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; font-weight: 700; }
    .header .quote-id { font-size: 14px; opacity: 0.95; font-family: 'Courier New', monospace; letter-spacing: 0.5px; }
    .content { padding: 40px 30px; }
    .greeting { font-size: 16px; color: #374151; margin-bottom: 24px; }
    .section { margin-bottom: 32px; }
    .section-title { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin-bottom: 12px; }
    .contact-info { background: #e5e7eb; padding: 16px; border-radius: 8px; margin-bottom: 24px; }
    .contact-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .contact-label { color: #4b5563; font-weight: 600; }
    .contact-value { color: #111827; font-weight: 500; }
    .cost-card { padding: 24px; border-radius: 12px; margin-bottom: 16px; }
    .cost-card.recurring { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border-left: 4px solid #3b82f6; }
    .cost-card.total { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-align: center; }
    .cost-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; opacity: 0.8; }
    .cost-card.total .cost-label { color: rgba(255,255,255,0.9); }
    .cost-detail { font-size: 14px; margin: 6px 0; opacity: 0.9; }
    .cost-amount { font-size: 32px; font-weight: 700; margin-top: 12px; }
    .cost-card.total .cost-amount { font-size: 42px; margin: 16px 0; }
    .cta-button { display: block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; padding: 18px 36px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; margin: 32px 0; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); }
    .validity { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; margin: 24px 0; }
    .validity p { margin: 0; font-size: 13px; color: #92400e; }
    .footer { background: #f9fafb; padding: 24px 30px; border-top: 1px solid #e5e7eb; text-align: center; }
    .footer p { color: #6b7280; font-size: 13px; margin: 8px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Custom Quote is Ready!</h1>
      <div class="quote-id">Quote #${quote.quoteNumber}</div>
    </div>
    <div class="content">
      <div class="greeting">
        <p>Hi ${quote.customer.name},</p>
        <p>Thank you for your interest in our services! We've prepared a custom quote for <strong>${quote.customer.businessName}</strong>.</p>
      </div>
      <div class="section">
        <div class="section-title">Your Information</div>
        <div class="contact-info">
          <div class="contact-row"><span class="contact-label">Business:</span><span class="contact-value">${quote.customer.businessName}</span></div>
          <div class="contact-row"><span class="contact-label">Contact:</span><span class="contact-value">${quote.customer.name}</span></div>
          <div class="contact-row"><span class="contact-label">Email:</span><span class="contact-value">${quote.customer.email}</span></div>
          <div class="contact-row"><span class="contact-label">Phone:</span><span class="contact-value">${quote.customer.phone}</span></div>
          <div class="contact-row"><span class="contact-label">Address:</span><span class="contact-value">${quote.customer.address}</span></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Monthly Recurring</div>
        <div class="cost-card recurring">
          <div class="cost-label">${quote.selectedPackage.name}</div>
          <div class="cost-detail">${quote.customer.userCount} users &times; ${formatCurrency(quote.selectedPackage.pricePerUser)}/user</div>
          <div class="cost-detail">${quote.customer.locationCount} locations &times; ${formatCurrency(quote.selectedPackage.pricePerLocation)}/location</div>
          <div class="cost-amount">${formatCurrency(quote.totals.recurringCosts)}<span style="font-size:16px;opacity:0.8;">/${quote.totals.recurringFrequency}</span></div>
        </div>
      </div>
      <div class="section">
        <div class="cost-card total">
          <div class="cost-label">Due Today</div>
          <div class="cost-amount">${formatCurrency(dueToday)}</div>
          <div style="opacity:0.9;font-size:14px;">Onboarding Costs &amp; One Time Costs</div>
        </div>
      </div>
      <div class="validity">
        <p><strong>This quote is valid for 30 days</strong> from ${formattedDate}</p>
      </div>
      <a href="${quoteUrl}" class="cta-button">Review &amp; Accept Quote &rarr;</a>
      <p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">Click the button above to review the full details, digitally sign, and proceed to secure payment.</p>
      <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">Quote Link: <a href="${quoteUrl}" style="color:#667eea;">${quoteUrl}</a></p>
    </div>
    <div class="footer">
      <p><strong>Need help?</strong> Reply to this email or contact our support team.</p>
      <p style="margin-top:16px;font-size:12px;">Quote generated on ${formattedDateTime}</p>
      <p style="font-size:11px;color:#9ca3af;margin-top:8px;">Quote ID: ${quote.quoteNumber} | Valid until ${formattedDate}</p>
    </div>
  </div>
</body>
</html>`;
}
