import type { QuoteData } from '@ntm/shared';
import { SERVICE_PROVIDER } from '@ntm/shared';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
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
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTermsContent(content: string): string {
  if (!content) return '';
  const sections = content.split('\n\n').filter((s) => s.trim());
  return sections
    .map((section) => {
      const trimmed = section.trim();
      const numberedMatch = trimmed.match(/^(\d+)\.\s+([A-Z\s&]+)\n(.+)/s);
      if (numberedMatch) {
        const [, num, title, body] = numberedMatch;
        return `<p class="term-clause"><strong>${num}. ${title.trim()}</strong><br>${body.trim().replace(/\n- /g, '<br>- ').replace(/\n/g, ' ')}</p>`;
      }
      if (trimmed.match(/^TERMS AND CONDITIONS$/i)) return '';
      return `<p class="term-clause">${trimmed.replace(/\n/g, ' ')}</p>`;
    })
    .filter((s) => s)
    .join('\n    ');
}

export function buildContractHtml(quote: QuoteData): string {
  const paidAtSigning =
    (quote.totals.onboardingCost || 0) + (quote.totals.oneTimeCosts || 0);

  const monthlyAddonsCost = (quote.selectedAddons || [])
    .filter((a) => a.frequency === 'monthly')
    .reduce((sum, a) => sum + (a.totalPrice || 0), 0);
  const totalMonthlyCost =
    (quote.selectedPackage?.calculatedPrice || 0) + monthlyAddonsCost;

  // Pull the contract length off the snapshotted package. Falls back to
  // "month-to-month" if the field is missing (legacy quotes pre-2026 didn't
  // snapshot it). 36 = 3-year, 60 = 5-year.
  const agreementMonths = Number((quote.selectedPackage as any)?.agreementMonths ?? 0);
  const contractTerm =
    agreementMonths === 0
      ? 'month-to-month'
      : agreementMonths === 36
        ? '3 years (36 months)'
        : agreementMonths === 60
          ? '5 years (60 months)'
          : `${agreementMonths} months`;
  const signedBy = quote.agreement?.signedBy || quote.customer.name;
  const signedAt = quote.agreement?.signedAt || quote.timestamp;
  const ipAddress = quote.agreement?.ipAddress || 'N/A';

  const addonsRows = (quote.selectedAddons || [])
    .map(
      (addon) => `
          <tr>
            <td>${addon.name}</td>
            <td>${addon.description || ''}</td>
            <td class="center">${addon.quantity}</td>
            <td class="center">${addon.frequency}</td>
            <td class="right">${formatCurrency(addon.totalPrice)}</td>
          </tr>`,
    )
    .join('');

  const featuresInline =
    quote.selectedPackage?.features?.length > 0
      ? quote.selectedPackage.features.join(' &bull; ')
      : '';

  const termsHtml = quote.terms?.content
    ? formatTermsContent(quote.terms.content)
    : buildDefaultTerms(quote, paidAtSigning, contractTerm);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      /* Margins are set by Puppeteer's pdf() options (see pdf.service.ts) so
         this only declares the page-counter footer. */
      @bottom-center { content: counter(page) " of " counter(pages); font-size: 8pt; color: #999; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      color: #222;
      line-height: 1.55;
      font-size: 10pt;
      background: white;
      padding: 0;
    }

    /* ── Header ── */
    .doc-header {
      border-bottom: 3px solid #1a3a5c;
      padding-bottom: 20px;
      margin-bottom: 25px;
    }
    .doc-header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .doc-header .company {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 11pt;
      font-weight: 700;
      color: #1a3a5c;
      letter-spacing: 0.5px;
    }
    .doc-header .company-sub {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 8.5pt;
      color: #666;
      font-weight: 400;
    }
    .doc-header .company-contact {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 8pt;
      color: #888;
      margin-top: 3px;
    }
    .doc-header .ref-block {
      text-align: right;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 8.5pt;
      color: #666;
      line-height: 1.6;
    }
    .doc-header .ref-block strong { color: #333; }
    .doc-title {
      font-size: 20pt;
      font-weight: 700;
      color: #1a3a5c;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin: 0;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }

    /* ── Sections ── */
    .section {
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    .section-title {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 10.5pt;
      font-weight: 700;
      color: #1a3a5c;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      border-bottom: 1.5px solid #1a3a5c;
      padding-bottom: 5px;
      margin-bottom: 12px;
    }

    /* ── Part banners (QUOTE vs CONTRACT) ──
       Two-part document. The first half is the QUOTE — what the customer
       is buying and what it costs. The second half is the CONTRACT — the
       legal terms + signature block. Each opens with a full-width banner
       so a reader skimming the PDF can tell which part they're in. */
    .part-banner {
      margin: 28px 0 18px 0;
      padding: 14px 18px;
      background: #1a3a5c;
      color: #fff;
      page-break-after: avoid;
      page-break-before: auto;
    }
    .part-banner .label {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 9pt;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.7);
    }
    .part-banner .title {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 16pt;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .part-banner .subtitle {
      font-size: 9.5pt;
      color: rgba(255,255,255,0.85);
      margin-top: 3px;
    }
    .part-banner.contract {
      page-break-before: always;
    }

    /* ── Parties ── */
    .parties {
      display: grid;
      grid-template-columns: 1fr 30px 1fr;
      gap: 0;
      margin-bottom: 20px;
    }
    .party p { margin: 3px 0; font-size: 9.5pt; }
    .party .name { font-weight: 700; font-size: 10.5pt; color: #1a3a5c; margin-bottom: 6px; }
    .party .label { color: #888; font-size: 8.5pt; font-family: 'Helvetica Neue', Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .parties-divider { display: flex; align-items: center; justify-content: center; }
    .parties-divider::after { content: ''; width: 1px; height: 80%; background: #ddd; }

    /* ── Key Details ── */
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 7px 0;
      border-bottom: 1px solid #eee;
      font-size: 9.5pt;
    }
    .detail-row:last-child { border-bottom: none; }
    .detail-row .label { color: #666; }
    .detail-row .value { font-weight: 600; color: #222; }

    /* ── Package ── */
    .pkg-name {
      font-size: 12pt;
      font-weight: 700;
      color: #1a3a5c;
      margin-bottom: 6px;
    }
    .pkg-detail { font-size: 9.5pt; margin: 4px 0; color: #444; }
    .pkg-features {
      font-size: 8.5pt;
      color: #666;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #eee;
      line-height: 1.8;
    }

    /* ── Table ── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    table th {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #fff;
      background: #1a3a5c;
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
    }
    table td {
      padding: 8px 10px;
      border-bottom: 1px solid #eee;
      vertical-align: top;
      color: #333;
    }
    table tr:last-child td { border-bottom: none; }
    table .center { text-align: center; }
    table .right { text-align: right; font-weight: 600; }
    table .desc { font-size: 8pt; color: #888; }

    /* ── Financial ── */
    .fin-table {
      width: 100%;
      border-collapse: collapse;
    }
    .fin-table td {
      padding: 9px 12px;
      font-size: 9.5pt;
      border-bottom: 1px solid #eee;
    }
    .fin-table tr:last-child td { border-bottom: none; }
    .fin-table .amount { text-align: right; font-weight: 600; font-family: 'Helvetica Neue', Arial, sans-serif; }
    .fin-table .discount { color: #2e7d32; }
    .fin-total {
      background: #1a3a5c;
      color: white;
    }
    .fin-total td {
      padding: 12px;
      font-size: 11pt;
      font-weight: 700;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      border-bottom: none;
    }
    .fin-note {
      font-size: 8.5pt;
      color: #666;
      margin-top: 10px;
      padding: 10px 12px;
      background: #f8f8f8;
      border-left: 3px solid #1a3a5c;
    }

    /* ── Terms ── */
    .terms-intro {
      font-size: 9pt;
      color: #666;
      font-style: italic;
      margin-bottom: 15px;
      text-align: center;
    }
    .term-clause {
      font-size: 9pt;
      margin: 0 0 10px 0;
      line-height: 1.65;
      text-align: justify;
      color: #333;
    }
    .term-clause strong { color: #1a3a5c; }

    /* ── Signature ── */
    .sig-block {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #1a3a5c;
    }
    .sig-intro {
      font-size: 9pt;
      color: #444;
      margin-bottom: 20px;
      text-align: center;
      line-height: 1.6;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 25px;
    }
    .sig-party { }
    .sig-party .sig-label {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #999;
      margin-bottom: 8px;
    }
    .sig-line {
      border-bottom: 1.5px solid #222;
      min-height: 36px;
      display: flex;
      align-items: flex-end;
      padding-bottom: 4px;
      margin-bottom: 6px;
    }
    .sig-name {
      font-family: 'Brush Script MT', 'Segoe Script', cursive;
      font-size: 18pt;
      color: #1a3a5c;
    }
    .sig-detail {
      font-size: 8pt;
      color: #888;
      margin: 3px 0;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    .sig-detail strong { color: #555; font-weight: 600; }

    /* ── Footer ── */
    .doc-footer {
      margin-top: 25px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      text-align: center;
      font-size: 7.5pt;
      color: #aaa;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="doc-header">
    <div class="doc-header-top">
      <div>
        <div class="company">SR Partners LLC</div>
        <div class="company-sub">dba National Technology Management</div>
        <div class="company-contact">${SERVICE_PROVIDER.address} &nbsp;|&nbsp; ${SERVICE_PROVIDER.phone} &nbsp;|&nbsp; ${SERVICE_PROVIDER.email}</div>
      </div>
      <div class="ref-block">
        <strong>Quote #</strong> ${quote.quoteNumber || 'N/A'}<br>
        <strong>Date</strong> ${formatDate(quote.timestamp)}<br>
        <strong>Valid For</strong> 30 days
      </div>
    </div>
    <h1 class="doc-title">Managed Services Agreement</h1>
  </div>

  <!-- ──────────────────────────────────────────────────────────────────
       PART 1 — QUOTE
       What the customer is buying and what it costs. Pricing breakdown,
       add-ons, financial summary, admin notes. This portion is what's
       being agreed-to; the legal terms + signature block follow.
       ────────────────────────────────────────────────────────────────── -->
  <div class="part-banner">
    <div class="label">Part 1 of 2</div>
    <div class="title">Quote</div>
    <div class="subtitle">Pricing, services, and add-ons for ${quote.customer.businessName}</div>
  </div>

  <!-- Service Package -->
  ${quote.selectedPackage ? (() => {
    const desktopCount = quote.customer.userCount || 0;
    const webCount = (quote.customer as any).webUserCount || 0;
    const pricePerUser = (quote.selectedPackage as any).pricePerUser || 0;
    const pricePerUserF3 = (quote.selectedPackage as any).pricePerUserF3 || 0;
    const pricePerLocation = (quote.selectedPackage as any).pricePerLocation || 0;
    const locationCount = quote.customer.locationCount || 0;
    const lines: string[] = [];
    if (desktopCount > 0) {
      lines.push(
        `${desktopCount} desktop user${desktopCount === 1 ? '' : 's'} &times; ${formatCurrency(pricePerUser)} = ${formatCurrency(pricePerUser * desktopCount)}`,
      );
    }
    if (webCount > 0 && pricePerUserF3 > 0) {
      lines.push(
        `${webCount} web user${webCount === 1 ? '' : 's'} &times; ${formatCurrency(pricePerUserF3)} = ${formatCurrency(pricePerUserF3 * webCount)}`,
      );
    }
    if (locationCount > 0) {
      lines.push(
        `${locationCount} location${locationCount === 1 ? '' : 's'} &times; ${formatCurrency(pricePerLocation)} = ${formatCurrency(pricePerLocation * locationCount)}`,
      );
    }
    return `
  <div class="section">
    <div class="section-title">Service Package</div>
    <div class="pkg-name">${quote.selectedPackage.name}</div>
    <div class="pkg-detail">${lines.join(' &nbsp;+&nbsp; ')} &mdash; billed ${quote.selectedPackage.frequency}</div>
    <div class="pkg-detail"><strong>Monthly Package Cost: ${formatCurrency(quote.selectedPackage.calculatedPrice)}</strong></div>
    ${featuresInline ? `<div class="pkg-features"><strong>Includes:</strong> ${featuresInline}</div>` : ''}
  </div>`;
  })() : ''}

  <!-- Notes (admin-authored, customer-acknowledged) -->
  ${quote.notes && quote.notes.trim() ? `
  <div class="section">
    <div class="section-title">Notes</div>
    <div style="white-space: pre-line; font-size: 10pt; line-height: 1.6;">${quote.notes
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</div>
  </div>` : ''}

  <!-- Add-on Services -->
  ${quote.selectedAddons?.length > 0 ? `
  <div class="section">
    <div class="section-title">Add-on Services</div>
    <table>
      <thead>
        <tr>
          <th>Service</th>
          <th>Description</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:center;">Billing</th>
          <th style="text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>${addonsRows}</tbody>
    </table>
  </div>` : ''}

  <!-- Financial Summary -->
  <div class="section">
    <div class="section-title">Financial Summary</div>
    <table class="fin-table">
      <tbody>
        <tr><td>Onboarding &amp; Implementation</td><td class="amount">${formatCurrency(quote.totals.onboardingCost)}</td></tr>
        <tr><td>One-Time Fees (setup &amp; one-time add-ons)</td><td class="amount">${formatCurrency(quote.totals.oneTimeCosts)}</td></tr>
        ${quote.totals.discount > 0 ? `<tr class="discount"><td>Discount Applied</td><td class="amount discount">-${formatCurrency(quote.totals.discount)}</td></tr>` : ''}
        <tr><td>Monthly Recurring (package + monthly add-ons)</td><td class="amount">${formatCurrency(totalMonthlyCost)}/mo</td></tr>
        <tr class="fin-total"><td>Due at Signing</td><td class="amount" style="text-align:right;">${formatCurrency(paidAtSigning)}</td></tr>
      </tbody>
    </table>
    <div class="fin-note">
      <strong>Ongoing Billing:</strong> Beginning the next billing cycle, ${formatCurrency(quote.totals.recurringCosts)} will be charged ${quote.totals.recurringFrequency || 'monthly'} for the duration of the ${contractTerm} contract term. Invoices are issued on the <strong>1st of every month</strong> and are due within <strong>30 days</strong> (Net 30). Onboarding and implementation will be completed within 30 days of contract execution.
    </div>
  </div>

  <!-- ──────────────────────────────────────────────────────────────────
       PART 2 — CONTRACT
       Legal terms binding the parties to the quote above. Includes the
       parties block, agreement details (term + billing cycle), the full
       terms & conditions, and the signature block.
       Forces a page break so the contract opens on a fresh page.
       ────────────────────────────────────────────────────────────────── -->
  <div class="part-banner contract">
    <div class="label">Part 2 of 2</div>
    <div class="title">Contract</div>
    <div class="subtitle">Legal terms governing the services quoted above</div>
  </div>

  <!-- Parties -->
  <div class="section">
    <div class="section-title">Parties to this Agreement</div>
    <div class="parties">
      <div class="party">
        <div class="label">Service Provider</div>
        <div class="name">National Technology Management</div>
        <p>SR Partners LLC</p>
        <p>${SERVICE_PROVIDER.address}</p>
        <p>${SERVICE_PROVIDER.phone} &nbsp;&bull;&nbsp; ${SERVICE_PROVIDER.email}</p>
        <p>Attention: ${SERVICE_PROVIDER.contact}</p>
      </div>
      <div class="parties-divider"></div>
      <div class="party">
        <div class="label">Client</div>
        <div class="name">${quote.customer.businessName}</div>
        <p>${quote.customer.name}</p>
        <p>${quote.customer.address}</p>
        <p>${quote.customer.phone} &nbsp;&bull;&nbsp; ${quote.customer.email}</p>
      </div>
    </div>
  </div>

  <!-- Agreement Details -->
  <div class="section">
    <div class="section-title">Agreement Details</div>
    <div class="detail-row"><span class="label">Contract Term</span><span class="value">${contractTerm}</span></div>
    <div class="detail-row"><span class="label">Effective Date</span><span class="value">${formatDate(signedAt)}</span></div>
    <div class="detail-row"><span class="label">Billing Cycle</span><span class="value" style="text-transform:capitalize;">${quote.totals.recurringFrequency || 'monthly'}</span></div>
    ${quote.onboarding?.totalCost > 0 ? `
    <div class="detail-row"><span class="label">Onboarding</span><span class="value">${quote.onboarding.userCount} users &times; ${formatCurrency(quote.onboarding.costPerUser)}/user = ${formatCurrency(quote.onboarding.finalCost)}</span></div>` : ''}
  </div>

  <!-- Terms & Conditions -->
  <div class="section" style="page-break-before: auto;">
    <div class="section-title">Terms &amp; Conditions</div>
    <p class="terms-intro">The following terms and conditions govern this Managed Services Agreement between the parties identified above.</p>
    ${termsHtml}
  </div>

  <!-- Signature -->
  <div class="sig-block">
    <p class="sig-intro">
      By electronically signing below, <strong>${signedBy}</strong> on behalf of <strong>${quote.customer.businessName}</strong>
      acknowledges having read, understood, and agreed to all terms and conditions of this ${contractTerm} Managed Services Agreement.
    </p>
    <div class="sig-grid">
      <div class="sig-party">
        <div class="sig-label">Client Signature</div>
        <div class="sig-line">
          ${signedBy ? `<div class="sig-name">${signedBy}</div>` : ''}
        </div>
        <div class="sig-detail"><strong>Name:</strong> ${signedBy}</div>
        <div class="sig-detail"><strong>Email:</strong> ${quote.customer.email}</div>
        <div class="sig-detail"><strong>Signed:</strong> ${formatDateTime(signedAt)}</div>
        <div class="sig-detail"><strong>IP:</strong> ${ipAddress}</div>
      </div>
      <div class="sig-party">
        <div class="sig-label">Service Provider</div>
        <div class="sig-line"></div>
        <div class="sig-detail"><strong>Name:</strong> ${SERVICE_PROVIDER.contact}</div>
        <div class="sig-detail"><strong>Title:</strong> Authorized Representative</div>
        <div class="sig-detail"><strong>Company:</strong> SR Partners LLC dba NTM</div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="doc-footer">
    This document constitutes a legally binding electronic agreement. The digital signature above, combined with timestamp and IP address verification,
    constitutes valid acceptance under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act) and the Uniform Electronic Transactions Act (UETA).<br>
    &copy; ${new Date().getFullYear()} SR Partners LLC dba National Technology Management &nbsp;&bull;&nbsp; ${SERVICE_PROVIDER.address} &nbsp;&bull;&nbsp; ${SERVICE_PROVIDER.phone}
  </div>

</body>
</html>`;
}

function buildDefaultTerms(
  quote: QuoteData,
  paidAtSigning: number,
  contractTerm: string,
): string {
  return `
    <p class="term-clause"><strong>1. Service Term.</strong> This ${contractTerm} agreement commences ${formatDate(quote.agreement?.signedAt || quote.timestamp)} and automatically renews annually unless either party provides 30 days written notice of non-renewal.</p>
    <p class="term-clause"><strong>2. Payment.</strong> Services totaling ${formatCurrency(paidAtSigning)} are due at signing. Recurring charges of ${formatCurrency(quote.totals.recurringCosts)} will be billed ${quote.totals.recurringFrequency || 'monthly'} in advance with 15-day payment terms. Late payments incur 1.5% monthly interest.</p>
    <p class="term-clause"><strong>3. Services.</strong> Provider shall deliver comprehensive managed IT services including ${quote.selectedPackage?.features?.slice(0, 3).join(', ') || 'monitoring, maintenance, and technical support'} as detailed in the Service Package section above.</p>
    <p class="term-clause"><strong>4. Service Levels.</strong> Response times shall be as follows: Critical issues (1 hour), High priority (4 hours), Normal requests (next business day). Target availability: 99.9% uptime during standard business hours (Monday&ndash;Friday, 8:00 AM &ndash; 6:00 PM local time).</p>
    <p class="term-clause"><strong>5. Implementation.</strong> ${quote.onboarding?.totalCost > 0 ? `Onboarding for ${quote.onboarding.userCount} users is included and shall be completed within 30 days of contract execution.` : 'Standard setup and configuration is included in the initial fees with a 30-day completion target.'}</p>
    <p class="term-clause"><strong>6. Termination.</strong> Either party may terminate this agreement with 90 days written notice. Early termination within the first 12 months shall incur fees equal to 50% of remaining monthly payments. Client must return all Provider equipment and settle outstanding invoices upon termination.</p>
    <p class="term-clause"><strong>7. Data Security.</strong> Provider shall maintain security measures compliant with GDPR, CCPA, and industry standards (SOC 2, ISO 27001). Data breaches shall be reported to Client within 72 hours of discovery.</p>
    <p class="term-clause"><strong>8. Limitation of Liability.</strong> Provider&rsquo;s total liability shall be capped at fees paid in the preceding 12 months. Provider shall not be liable for indirect, consequential, or incidental damages, lost profits, or business interruption.</p>
    <p class="term-clause"><strong>9. Confidentiality.</strong> Both parties agree to protect proprietary information, trade secrets, and business data during the term and for 2 years post-termination. This obligation excludes publicly available information or independently developed content.</p>
    <p class="term-clause"><strong>10. Support Hours.</strong> Standard support is available Monday&ndash;Friday, 8:00 AM &ndash; 6:00 PM local time, excluding holidays. ${quote.selectedAddons?.some((a) => a.name.toLowerCase().includes('premium')) ? '24/7 premium support is included per the selected add-on services.' : 'After-hours support is available at additional rates upon request.'}</p>
    <p class="term-clause"><strong>11. Modifications.</strong> Any changes to services or pricing require written mutual consent with 30 days notice for upgrades or downgrades. Annual price adjustments shall be limited to 5% with 60 days advance notice.</p>
    <p class="term-clause"><strong>12. Force Majeure.</strong> Neither party shall be liable for performance failures due to circumstances beyond reasonable control, including natural disasters, pandemics, government actions, terrorism, or critical infrastructure failures.</p>
    <p class="term-clause"><strong>13. Intellectual Property.</strong> Pre-existing intellectual property remains with the respective owner. Client-specific work product shall become Client property upon full payment. Provider retains rights to general methodologies, frameworks, and development tools.</p>
    <p class="term-clause"><strong>14. Dispute Resolution.</strong> This agreement shall be governed by the laws of the State of Michigan. Disputes shall be resolved through binding arbitration per American Arbitration Association Commercial Rules. Each party bears its own costs.</p>
    <p class="term-clause"><strong>15. Entire Agreement.</strong> This document constitutes the complete agreement between the parties, superseding all prior negotiations, representations, or agreements whether written or oral. Modifications require written documentation signed by authorized representatives of both parties.</p>`;
}
