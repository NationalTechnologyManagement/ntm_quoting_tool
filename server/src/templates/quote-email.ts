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

export interface QuoteEmailOptions {
  // Lite quoting tool: render as an "estimate" with a "Request Booking" CTA
  // pointing at the GHL calendar URL instead of the payment link.
  leadGen?: boolean;
  bookingUrl?: string;
}

export function buildQuoteEmailHtml(
  quote: QuoteData,
  quoteUrl: string,
  options?: QuoteEmailOptions,
): string {
  // What the customer actually pays at checkout — matches the AP invoice
  // composition built in ap.service.ts buildLineItems(): onboarding (or $0 if
  // waived) + one-time addons (typically $0 in current catalog) + first month.
  // The email used to show only the first two, which left "Due Today" looking
  // like $0 for SafeSecure quotes (waived onboarding + no setup-fee addons).
  const onboardingCost = quote.totals.onboardingCost || 0;
  const oneTimeCosts = quote.totals.oneTimeCosts || 0;
  const firstMonth = quote.totals.recurringCosts || 0;
  const dueToday = onboardingCost + oneTimeCosts + firstMonth;

  const formattedDate = formatDate(quote.timestamp);
  const formattedDateTime = formatDateTime(quote.timestamp);

  const leadGen = options?.leadGen === true;
  const ctaUrl = leadGen ? (options?.bookingUrl || quoteUrl) : quoteUrl;
  const docNoun = leadGen ? 'Estimate' : 'Quote';

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
      <h1>Your Custom ${docNoun} is Ready!</h1>
      <div class="quote-id">${docNoun} #${quote.quoteNumber}</div>
    </div>
    <div class="content">
      <div class="greeting">
        <p>Hi ${quote.customer.name},</p>
        <p>Thank you for your interest in our services! We've prepared a custom ${docNoun.toLowerCase()} for <strong>${quote.customer.businessName}</strong>.${leadGen ? ' A sales rep will follow up with you to confirm pricing and finalize the agreement.' : ''}</p>
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
        <div class="section-title">Monthly Service</div>
        <div class="cost-card recurring">
          <div class="cost-label">${quote.selectedPackage.name}</div>
          <div class="cost-detail">${quote.customer.userCount} users &times; ${formatCurrency(quote.selectedPackage.pricePerUser)}/user</div>
          <div class="cost-detail">${quote.customer.locationCount} locations &times; ${formatCurrency(quote.selectedPackage.pricePerLocation)}/location</div>
          <div class="cost-amount">${formatCurrency(firstMonth)}<span style="font-size:16px;opacity:0.8;">/${quote.totals.recurringFrequency}</span></div>
        </div>
      </div>

      <div class="section">
        <div class="cost-card total">
          <div class="cost-label">${leadGen ? 'Estimated First Month' : 'Due Today to Start Services'}</div>
          <div class="cost-amount">${formatCurrency(dueToday)}</div>
          <div style="opacity:0.95;font-size:14px;line-height:1.6;">
            ${onboardingCost > 0 ? `${formatCurrency(onboardingCost)} onboarding + ` : ''}${oneTimeCosts > 0 ? `${formatCurrency(oneTimeCosts)} one-time + ` : ''}${formatCurrency(firstMonth)} first month
          </div>
          <div style="opacity:0.85;font-size:13px;margin-top:12px;">Then ${formatCurrency(firstMonth)}/${quote.totals.recurringFrequency} starting next billing cycle</div>
        </div>
      </div>

      <div class="validity">
        <p>${leadGen
          ? `<strong>This is a starting estimate.</strong> A sales rep will follow up to confirm scope and finalize pricing. Estimate is valid for 30 days from ${formattedDate}.`
          : `<strong>To start your services, complete payment for the amount above.</strong> Services activate once payment is captured. This quote is valid for 30 days from ${formattedDate}.`}</p>
      </div>

      <a href="${ctaUrl}" class="cta-button">${leadGen ? 'Request Booking &rarr;' : `Review &amp; Pay ${formatCurrency(dueToday)} &rarr;`}</a>
      <p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">${leadGen
        ? 'Click the button above to schedule a time with a sales rep.'
        : 'Click the button above to review the full details, digitally sign, and complete secure payment to start your services.'}</p>
      <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">${leadGen ? 'Booking Link' : 'Quote Link'}: <a href="${ctaUrl}" style="color:#667eea;">${ctaUrl}</a></p>
    </div>
    <div class="footer">
      <p><strong>Need help?</strong> Reply to this email or contact our support team.</p>
      <p style="margin-top:16px;font-size:12px;">${docNoun} generated on ${formattedDateTime}</p>
      <p style="font-size:11px;color:#9ca3af;margin-top:8px;">${docNoun} ID: ${quote.quoteNumber} | Valid until ${formattedDate}</p>
    </div>
  </div>
</body>
</html>`;
}
