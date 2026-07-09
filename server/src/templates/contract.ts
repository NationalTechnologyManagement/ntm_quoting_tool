import type { QuoteData } from '@ntm/shared';
import { SERVICE_PROVIDER } from '@ntm/shared';
import { NTM_LOGO_DATA_URI } from './ntm-logo.js';

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

function escapeHtmlBasic(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderInline(text: string): string {
  // Inline **bold** → <strong>. HTML-escape first so the source text can
  // contain raw <, >, &.
  return escapeHtmlBasic(text).replace(
    /\*\*([^*]+)\*\*/g,
    '<strong>$1</strong>',
  );
}

// Parse the markdown-flavored Master Services Agreement text and emit
// styled HTML for the contract PDF. Recognized line prefixes mirror the
// client-side renderer (see client/src/lib/terms-renderer.tsx):
//   `# Title` `## SECTION` `### Subsection` `- bullet` `| a | b |` `> caption`
// Anything else is a paragraph. Blank lines separate blocks.
function formatTermsContent(content: string): string {
  if (!content) return '';
  const lines = content.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      // Document title is already rendered as the "Terms & Conditions"
      // section header in the parent template — skip the in-text duplicate.
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      out.push(
        `<div class="term-section">${renderInline(line.slice(3).trim())}</div>`,
      );
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      out.push(
        `<div class="term-subsection">${renderInline(line.slice(4).trim())}</div>`,
      );
      i++;
      continue;
    }
    if (line.startsWith('> ')) {
      out.push(
        `<p class="term-caption">${renderInline(line.slice(2).trim())}</p>`,
      );
      i++;
      continue;
    }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(renderInline(lines[i].trim().slice(2).trim()));
        i++;
      }
      out.push(
        `<ul class="term-bullets">${items.map((it) => `<li>${it}</li>`).join('')}</ul>`,
      );
      continue;
    }
    if (line.startsWith('|') && line.endsWith('|')) {
      const rows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim().startsWith('|') &&
        lines[i].trim().endsWith('|')
      ) {
        const cells = lines[i]
          .trim()
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        rows.push(cells);
        i++;
      }
      if (rows.length) {
        const [header, ...body] = rows;
        out.push(
          `<table class="term-table"><thead><tr>${header
            .map((c) => `<th>${renderInline(c)}</th>`)
            .join('')}</tr></thead><tbody>${body
            .map(
              (row) =>
                `<tr>${row.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`,
            )
            .join('')}</tbody></table>`,
        );
      }
      continue;
    }
    // Paragraph: collapse a run of plain lines into one block.
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next) break;
      if (
        next.startsWith('# ') ||
        next.startsWith('## ') ||
        next.startsWith('### ') ||
        next.startsWith('> ') ||
        next.startsWith('- ') ||
        (next.startsWith('|') && next.endsWith('|'))
      ) {
        break;
      }
      para.push(next);
      i++;
    }
    out.push(`<p class="term-paragraph">${renderInline(para.join(' '))}</p>`);
  }
  return out.join('\n    ');
}

export function buildContractHtml(quote: QuoteData): string {
  // Existing-customer quotes render the "Service Addition" variant: same
  // two-part structure, but framed as adding services onto their current
  // agreement — no onboarding language, no confusion with the new-customer
  // Managed Services Agreement.
  const isExisting = !!quote.isExistingCustomer;
  const docTitle = isExisting ? 'Service Addition Agreement' : 'Managed Services Agreement';

  const paidAtSigning =
    (quote.totals.onboardingCost || 0) + (quote.totals.oneTimeCosts || 0);

  const customItems = quote.customItems ?? [];
  const monthlyAddonsCost = (quote.selectedAddons || [])
    .filter((a) => a.pricingType !== 'one-time-only' && (a.recurringPrice ?? 0) > 0)
    .reduce((sum, a) => sum + (a.recurringPrice ?? 0) * (a.quantity || 1), 0);
  // Monthly-equivalent: annually-priced custom items count at price/12 so the
  // "Monthly Recurring" line matches totals.recurringCosts (same rule as
  // sumCustomRecurring server-side) instead of stating the annual price as a
  // monthly charge.
  const monthlyCustomCost = customItems.reduce((sum, i) => {
    const price = Number(i.recurringPrice) || 0;
    const monthly = i.recurringFrequency === 'annually' ? price / 12 : price;
    return sum + monthly * (Number(i.quantity) || 1);
  }, 0);
  const totalMonthlyCost =
    (quote.selectedPackage?.calculatedPrice || 0) + monthlyAddonsCost + monthlyCustomCost;

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
  // The template renders the same way for an in-flight preview AND for the
  // signed contract email. Distinguish by whether the agreement payload is
  // actually present — DON'T fall back to customer.name / quote.timestamp,
  // because that made the preview look already-signed even when the
  // customer hadn't touched it. NTM (service provider) is treated as
  // pre-signed: Kelly's name renders on the provider side in both modes.
  const isSigned = !!quote.agreement?.signedBy;
  const signedBy = quote.agreement?.signedBy ?? '';
  const signedAt = quote.agreement?.signedAt ?? '';
  const ipAddress = quote.agreement?.ipAddress ?? '';
  // Optional rasterized handwritten signature (PNG data URL). When present
  // the client signature spot renders this image instead of the cursive
  // typed name. We still print the typed legal name underneath for audit.
  const signatureImage = quote.agreement?.signatureImage ?? '';

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

  // Categorized features for the contract's "Includes" block. Falls back to
  // the legacy flat features list when an older snapshotted quote doesn't
  // carry featureGroups. Renders as bolded category headers + bulleted
  // items so the customer can see everything they're agreeing to.
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const pkgGroups: Array<{ category: string; items: string[] }> =
    (quote.selectedPackage as any)?.featureGroups &&
    (quote.selectedPackage as any).featureGroups.length > 0
      ? (quote.selectedPackage as any).featureGroups
      : (quote.selectedPackage?.features?.length ?? 0) > 0
        ? [{ category: 'Includes', items: quote.selectedPackage!.features }]
        : [];
  const featuresHtml = pkgGroups.length
    ? pkgGroups
        .map(
          (g) => `
      <div style="margin-top:8px;">
        <div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1a3a5c;margin-bottom:4px;">${escapeHtml(g.category)}</div>
        <ul style="margin:0 0 0 16px;padding:0;font-size:10pt;">
          ${g.items.map((it) => `<li style="margin:1px 0;">${escapeHtml(it)}</li>`).join('')}
        </ul>
      </div>`,
        )
        .join('')
    : '';

  const termsHtml = quote.terms?.content
    ? formatTermsContent(quote.terms.content)
    : buildDefaultTerms(quote, paidAtSigning, contractTerm);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* Page-number footer is rendered by Puppeteer (displayHeaderFooter in
       pdf.service.ts). Chrome does not support @page margin boxes, so the
       old @bottom-center counter rule silently never rendered. */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      /* Keep the navy banners / table headers visible when the customer
         prints from the browser preview — without this, "Background
         graphics" defaults off and the first page looks blank. */
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Page margins for BOTH render paths. Chrome gives author @page margins
       precedence over Puppeteer's pdf() margin options, so this rule — not
       pdf.service.ts — is what actually governs the emailed PDF, and it also
       covers customers using the browser's "Save as PDF" on the preview.
       Keep it in sync with pdf.service.ts (0.5in top, 0.75in sides, 0.6in
       bottom reserved for the page-number footer). */
    @page { margin: 0.5in 0.75in 0.6in; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      color: #222;
      line-height: 1.5;
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

    /* ── Sections ──
       IMPORTANT: no page-break-inside: avoid here. With it, a long section
       (e.g. Service Package with the full feature list) that doesn't fit on
       page 1 got pushed WHOLE to page 2, leaving the first page nearly
       blank. Long sections must be allowed to flow across pages; only small
       atomic blocks (signature grid, parties) avoid internal breaks. */
    .section {
      margin-bottom: 18px;
    }
    .section-title {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 10.5pt;
      font-weight: 700;
      color: #1a3a5c;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      border-bottom: 1.5px solid #1a3a5c;
      padding-bottom: 4px;
      margin-bottom: 10px;
      /* Never leave a section title stranded at the bottom of a page. */
      page-break-after: avoid;
    }

    /* ── Part banners (QUOTE vs CONTRACT) ──
       Two-part document. The first half is the QUOTE — what the customer
       is buying and what it costs. The second half is the CONTRACT — the
       legal terms + signature block. Each opens with a full-width banner
       so a reader skimming the PDF can tell which part they're in. */
    .part-banner {
      margin: 0 0 16px 0;
      padding: 12px 18px;
      background: #1a3a5c;
      color: #fff;
      page-break-after: avoid;
      page-break-before: auto;
      page-break-inside: avoid;
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

    /* ── Existing-customer notice ── */
    .notice-band {
      background: #eef4fa;
      border: 1px solid #b9d0e8;
      border-left: 4px solid #1a3a5c;
      padding: 10px 14px;
      margin-bottom: 18px;
      font-size: 9.5pt;
      line-height: 1.55;
      color: #1a3a5c;
      page-break-inside: avoid;
    }
    .notice-band strong { text-transform: uppercase; letter-spacing: 0.8px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.5pt; }

    /* ── Parties ── */
    .parties {
      display: grid;
      grid-template-columns: 1fr 30px 1fr;
      gap: 0;
      margin-bottom: 18px;
      page-break-inside: avoid;
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
      /* Must be explicit: the generic "table td" color rule (#333) wins
         over inheritance from the tr — which rendered navy-on-navy. */
      color: #fff;
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
    /* Structured Master Services Agreement blocks. Mirrors the source PDF:
       full-width section banners, orange-styled subsection labels, tight
       bullet lists, italic captions, and a header-on-banner table. */
    .term-section {
      background: #e8521e;
      color: #ffffff;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-weight: 700;
      font-size: 10pt;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 8px 14px;
      margin: 18px 0 10px 0;
      page-break-after: avoid;
    }
    .term-subsection {
      color: #e8521e;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-weight: 700;
      font-size: 9.5pt;
      margin: 12px 0 4px 0;
      page-break-after: avoid;
    }
    .term-bullets {
      margin: 0 0 8px 22px;
      padding: 0;
      font-size: 9pt;
      line-height: 1.55;
      color: #333;
    }
    .term-bullets li { margin: 2px 0; }
    .term-paragraph {
      font-size: 9pt;
      margin: 0 0 8px 0;
      line-height: 1.6;
      color: #333;
    }
    .term-caption {
      font-size: 8.5pt;
      font-style: italic;
      color: #666;
      margin: 0 0 8px 0;
    }
    .term-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin: 6px 0 12px 0;
    }
    .term-table th {
      background: #e8521e;
      color: #ffffff;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      padding: 6px 8px;
      text-align: left;
      font-size: 7.5pt;
    }
    .term-table td {
      padding: 6px 8px;
      border-bottom: 1px solid #eee;
      vertical-align: top;
      color: #333;
    }

    /* ── Signature ── */
    .sig-block {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 2px solid #1a3a5c;
      /* Keep the signature block intact on one page. */
      page-break-inside: avoid;
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
    .sig-image {
      max-height: 60px;
      max-width: 100%;
      object-fit: contain;
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
      <div style="display:flex; align-items:center; gap:14px;">
        <img
          src="${NTM_LOGO_DATA_URI}"
          alt="NTM"
          style="width:56px; height:56px; flex-shrink:0;"
        />
        <div>
          <div class="company">SR Partners LLC</div>
          <div class="company-sub">dba National Technology Management</div>
          <div class="company-contact">${SERVICE_PROVIDER.address} &nbsp;|&nbsp; ${SERVICE_PROVIDER.phone} &nbsp;|&nbsp; ${SERVICE_PROVIDER.email}</div>
        </div>
      </div>
      <div class="ref-block">
        <strong>Quote #</strong> ${quote.quoteNumber || 'N/A'}<br>
        <strong>Date</strong> ${formatDate(quote.timestamp)}<br>
        <strong>Valid For</strong> 30 days
      </div>
    </div>
    <h1 class="doc-title">${docTitle}</h1>
  </div>

  ${isExisting ? `
  <!-- Existing-customer callout: this document ADDS services; it does not
       replace or restate the customer's current agreement. -->
  <div class="notice-band">
    <strong>Existing Customer &mdash; Service Addition</strong><br>
    This document adds the services listed below to ${escapeHtmlBasic(quote.customer.businessName)}'s current
    agreement with National Technology Management. All existing services, pricing, and terms
    remain unchanged and in full effect — the additions below are billed alongside them.
  </div>` : ''}

  <!-- ──────────────────────────────────────────────────────────────────
       PART 1 — QUOTE
       What the customer is buying and what it costs. Pricing breakdown,
       add-ons, financial summary, admin notes. This portion is what's
       being agreed-to; the legal terms + signature block follow.
       ────────────────────────────────────────────────────────────────── -->
  <div class="part-banner">
    <div class="label">Part 1 of 2</div>
    <div class="title">Quote</div>
    <div class="subtitle">${isExisting ? `Added services and pricing for ${quote.customer.businessName}` : `Pricing, services, and add-ons for ${quote.customer.businessName}`}</div>
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
    // Render each line on its own row instead of joining with " + " on a
    // single line. The single-line format made the trailing "— billed
    // monthly" look like it applied to just the last term ("...$399 =
    // $399 — billed monthly") instead of the package total.
    const lineRows = lines
      .map((l) => `<div style="font-size:10pt; line-height:1.55;">${l}</div>`)
      .join('');
    return `
  <div class="section">
    <div class="section-title">Service Package</div>
    <div class="pkg-name">${quote.selectedPackage.name}</div>
    ${lineRows}
    <div class="pkg-detail" style="margin-top:6px;"><strong>Monthly Package Cost: ${formatCurrency(quote.selectedPackage.calculatedPrice)}</strong> &mdash; billed ${quote.selectedPackage.frequency}</div>
    ${featuresHtml ? `<div class="pkg-features"><strong>What's included:</strong>${featuresHtml}</div>` : ''}
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

  <!-- Custom line items (staff-added) -->
  ${customItems.length > 0 ? `
  <div class="section">
    <div class="section-title">Custom Items &amp; Services</div>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Description</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:right;">Recurring</th>
          <th style="text-align:right;">One-Time</th>
        </tr>
      </thead>
      <tbody>${customItems
        .map((item) => {
          const qty = Number(item.quantity) || 1;
          const rec = Number(item.recurringPrice) || 0;
          const oneTime = Number(item.oneTimePrice) || 0;
          return `
          <tr>
            <td>${escapeHtmlBasic(item.name)}</td>
            <td class="desc">${escapeHtmlBasic(item.description || '')}</td>
            <td class="center">${qty}</td>
            <td class="right">${rec > 0 ? `${formatCurrency(rec * qty)}/${item.recurringFrequency === 'annually' ? 'yr' : 'mo'}` : '&mdash;'}</td>
            <td class="right">${oneTime > 0 ? formatCurrency(oneTime * qty) : '&mdash;'}</td>
          </tr>`;
        })
        .join('')}</tbody>
    </table>
  </div>` : ''}

  <!-- Financial Summary. Zero rows are dropped — a wall of $0.00 lines was a
       big part of why the old layout read as cluttered. -->
  <div class="section">
    <div class="section-title">Financial Summary</div>
    <table class="fin-table">
      <tbody>
        ${quote.totals.onboardingCost > 0 ? `<tr><td>Onboarding &amp; Implementation</td><td class="amount">${formatCurrency(quote.totals.onboardingCost)}</td></tr>` : ''}
        ${quote.totals.oneTimeCosts > 0 ? `<tr><td>One-Time Fees (setup, hardware &amp; one-time items)</td><td class="amount">${formatCurrency(quote.totals.oneTimeCosts)}</td></tr>` : ''}
        ${quote.totals.discount > 0 ? `<tr class="discount"><td>Discount Applied</td><td class="amount discount">-${formatCurrency(quote.totals.discount)}</td></tr>` : ''}
        ${totalMonthlyCost > 0 ? `<tr><td>${isExisting ? 'Added Monthly Recurring (new services on this quote)' : 'Monthly Recurring (package + monthly add-ons)'}</td><td class="amount">${formatCurrency(totalMonthlyCost)}/mo</td></tr>` : ''}
        <tr class="fin-total"><td>Due at Signing</td><td class="amount" style="text-align:right;">${formatCurrency(paidAtSigning)}</td></tr>
      </tbody>
    </table>
    <div class="fin-note">
      ${quote.totals.recurringCosts <= 0
        ? `<strong>Billing:</strong> This quote contains one-time charges only — there is no new recurring charge. Invoices are issued on the <strong>1st of every month</strong> and are due within <strong>30 days</strong> (Net 30).`
        : isExisting
          ? `<strong>Ongoing Billing:</strong> Beginning the next billing cycle, the added services above (${formatCurrency(quote.totals.recurringCosts)}/${quote.totals.recurringFrequency || 'monthly'}) will appear on your existing NTM invoice alongside your current services. Your existing charges are unchanged. Invoices are issued on the <strong>1st of every month</strong> and are due within <strong>30 days</strong> (Net 30).`
          : `<strong>Ongoing Billing:</strong> Beginning the next billing cycle, ${formatCurrency(quote.totals.recurringCosts)} will be charged ${quote.totals.recurringFrequency || 'monthly'} for the duration of the ${contractTerm} contract term. Invoices are issued on the <strong>1st of every month</strong> and are due within <strong>30 days</strong> (Net 30). Onboarding and implementation will be completed within 30 days of contract execution.`}
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
    <div class="subtitle">${isExisting ? 'Legal terms governing the added services quoted above' : 'Legal terms governing the services quoted above'}</div>
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
    ${isExisting ? `<div class="detail-row"><span class="label">Agreement Type</span><span class="value">Addition to existing services</span></div>` : ''}
    <div class="detail-row"><span class="label">Contract Term</span><span class="value">${contractTerm}</span></div>
    <div class="detail-row"><span class="label">Effective Date</span><span class="value">${isSigned && signedAt ? formatDate(signedAt) : 'Upon signing'}</span></div>
    <div class="detail-row"><span class="label">Billing Cycle</span><span class="value" style="text-transform:capitalize;">${quote.totals.recurringFrequency || 'monthly'}</span></div>
    ${!isExisting && quote.onboarding?.totalCost > 0 ? `
    <div class="detail-row"><span class="label">Onboarding</span><span class="value">${quote.onboarding.userCount} users &times; ${formatCurrency(quote.onboarding.costPerUser)}/user = ${formatCurrency(quote.onboarding.finalCost)}</span></div>` : ''}
  </div>

  <!-- Terms & Conditions -->
  <div class="section" style="page-break-before: auto;">
    <div class="section-title">Terms &amp; Conditions</div>
    <p class="terms-intro">The following terms and conditions govern this ${docTitle} between the parties identified above.</p>
    ${termsHtml}
  </div>

  <!-- Signature
       Preview (unsigned): client side renders blank lines for the customer
       to fill in by e-signing; service-provider side already shows Kelly's
       cursive countersignature.
       Final (signed): client side renders the customer's e-signature +
       captured metadata; service-provider side identical to preview. -->
  <div class="sig-block">
    <p class="sig-intro">
      ${isSigned
        ? `By electronically signing below, <strong>${signedBy}</strong> on behalf of <strong>${quote.customer.businessName}</strong> acknowledged having read, understood, and agreed to all terms and conditions of this ${contractTerm} ${docTitle}.`
        : `By electronically signing below, an authorized representative of <strong>${quote.customer.businessName}</strong> acknowledges having read, understood, and agreed to all terms and conditions of this ${contractTerm} ${docTitle}.`}
    </p>
    <div class="sig-grid">
      <div class="sig-party">
        <div class="sig-label">Client Signature</div>
        <div class="sig-line" style="${signatureImage ? 'min-height:64px;' : ''}">
          ${
            isSigned
              ? signatureImage
                ? `<img class="sig-image" src="${signatureImage}" alt="Client signature" />`
                : `<div class="sig-name">${signedBy}</div>`
              : ''
          }
        </div>
        <div class="sig-detail"><strong>Name:</strong> ${isSigned ? signedBy : '&nbsp;'}</div>
        <div class="sig-detail"><strong>Email:</strong> ${isSigned ? quote.customer.email : '&nbsp;'}</div>
        <div class="sig-detail"><strong>Signed:</strong> ${isSigned && signedAt ? formatDateTime(signedAt) : '&nbsp;'}</div>
        <div class="sig-detail"><strong>IP:</strong> ${isSigned ? (ipAddress || 'N/A') : '&nbsp;'}</div>
      </div>
      <div class="sig-party">
        <div class="sig-label">Service Provider (Pre-Signed)</div>
        <div class="sig-line">
          <div class="sig-name">${SERVICE_PROVIDER.contact}</div>
        </div>
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
