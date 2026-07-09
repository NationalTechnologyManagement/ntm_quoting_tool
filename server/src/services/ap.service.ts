import { apFetch, isAPConfigured, getOAuthToken } from '../config/ap.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import * as quoteService from './quote.service.js';
import type { QuoteData } from '@ntm/shared';

const AP_BASE_URL = 'https://public-api.alternativepayments.io';

/** AP returns URLs without a scheme on the branded `pay.trustntm.com` checkout
 *  domain. If we hand a scheme-less URL to window.location.href the browser
 *  treats it as a relative path and prepends our origin (breaking the
 *  redirect). Normalize defensively. */
function ensureHttpsUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

// ── Customer Management ─────────────────────────────────────────────

/** Find an existing AP customer by our external_id (== quoteNumber). Returns
 *  the AP customer id if one is already on file, or null. Used to recover
 *  from a previous half-failed checkout attempt that already minted the
 *  customer record but errored out before the quote got updated. */
async function findCustomerByExternalId(externalId: string): Promise<string | null> {
  // AP's customers list supports a search filter; try a couple of common
  // shapes since their docs vary between query params.
  const tries = [
    `/customers?external_id=${encodeURIComponent(externalId)}`,
    `/customers?filter[external_id]=${encodeURIComponent(externalId)}`,
    `/customers?search=${encodeURIComponent(externalId)}`,
  ];
  for (const path of tries) {
    try {
      const r = await apFetch(path);
      if (!r.ok) continue;
      const body = await r.json();
      const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
      const match = list.find((c: any) => c?.external_id === externalId || c?.externalId === externalId);
      if (match?.id) return match.id;
    } catch {
      /* try next shape */
    }
  }
  return null;
}

export async function createCustomer(quote: QuoteData): Promise<string> {
  if (!isAPConfigured()) throw new AppError(503, 'Alternative Payments not configured');

  // If the quote already has an apCustomerId persisted, just reuse it. Skips
  // the whole find-or-create dance for the returning-checkout case (e.g.
  // customer abandoned the AP page and clicked Purchase Now again).
  if (quote.apCustomerId) return quote.apCustomerId;

  const res = await apFetch('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: quote.customer.businessName,
      email: quote.customer.email,
      external_id: quote.quoteNumber,
    }),
  });

  if (res.ok) {
    const data = await res.json();
    return data.id;
  }

  // AP returns 400 with code=bad_request / message="This external id is
  // already used" if a previous attempt half-completed. Recover by looking
  // up the existing customer and reusing it.
  const text = await res.text();
  if (res.status === 400 && /external id is already used/i.test(text)) {
    const existing = await findCustomerByExternalId(quote.quoteNumber);
    if (existing) {
      console.log(`[AP] recovered existing customer ${existing} for ${quote.quoteNumber}`);
      return existing;
    }
  }
  throw new AppError(502, `AP customer creation failed (${res.status}): ${text}`);
}

// ── Invoice Management ──────────────────────────────────────────────

export async function createInvoice(
  quote: QuoteData,
  apCustomerId: string,
): Promise<{ invoiceId: string; paymentLink: string }> {
  if (!isAPConfigured()) throw new AppError(503, 'Alternative Payments not configured');

  const lineItems = buildLineItems(quote);
  if (lineItems.length === 0) throw new AppError(400, 'No payable items found');

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const res = await apFetch('/invoices', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: apCustomerId,
      currency: 'USD',
      due_date: dueDate.toISOString().slice(0, 10),
      line_items: lineItems,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AppError(502, `AP invoice creation failed (${res.status}): ${text}`);
  }

  const invoice = await res.json();

  // Get the hosted payment link. AP serves these on a branded subdomain
  // (e.g. pay.trustntm.com/<token>) and returns the URL without a scheme,
  // so normalize to a fully-qualified https:// URL before handing it to
  // the frontend.
  const linkRes = await apFetch(`/invoices/${invoice.id}/payment-link`);
  const linkData = linkRes.ok ? await linkRes.json() : { url: '' };

  return { invoiceId: invoice.id, paymentLink: ensureHttpsUrl(linkData.url) };
}

// ── Checkout Token ──────────────────────────────────────────────────

export async function getCheckoutToken(
  apCustomerId: string,
  apInvoiceId: string,
): Promise<string> {
  const token = await getOAuthToken();

  const res = await fetch(`${AP_BASE_URL}/v1/checkout-auth/init`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer_id: apCustomerId,
      invoice_id: apInvoiceId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AppError(502, `AP checkout token failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.access_token || data.token;
}

// ── Full Checkout Flow ──────────────────────────────────────────────

export async function createCheckout(quote: QuoteData): Promise<{
  checkoutToken: string;
  invoiceId: string;
  paymentLink: string;
  customerId: string;
}> {
  const customerId = await createCustomer(quote);
  const { invoiceId, paymentLink } = await createInvoice(quote, customerId);

  // The checkout token is only used by AP's inline Web SDK. The frontend
  // uses the hosted payment link redirect, so failures here shouldn't block
  // checkout. The /v1/checkout-auth/init endpoint has been observed
  // returning 404 in some AP environments; treat it as best-effort.
  let checkoutToken = '';
  try {
    checkoutToken = await getCheckoutToken(customerId, invoiceId);
  } catch (err) {
    console.warn('[AP] checkout token unavailable, continuing with payment link only:', err);
  }

  // Persist AP session on the quote
  await quoteService.updateQuoteAPSession(
    quote.quoteNumber,
    customerId,
    invoiceId,
    paymentLink,
  );

  return { checkoutToken, invoiceId, paymentLink, customerId };
}

// ── Payment Link (for returning customers) ──────────────────────────

export async function getOrCreatePaymentLink(quote: QuoteData): Promise<{
  checkoutToken: string;
  invoiceId: string;
  paymentLink: string;
}> {
  // If there's an existing invoice, try to get a fresh checkout token
  if (quote.apInvoiceId && quote.apCustomerId) {
    try {
      const checkoutToken = await getCheckoutToken(quote.apCustomerId, quote.apInvoiceId);
      const linkRes = await apFetch(`/invoices/${quote.apInvoiceId}/payment-link`);
      const linkData = linkRes.ok ? await linkRes.json() : { url: quote.apPaymentLink || '' };
      return {
        checkoutToken,
        invoiceId: quote.apInvoiceId,
        paymentLink: ensureHttpsUrl(linkData.url || quote.apPaymentLink || ''),
      };
    } catch {
      // Token expired or invoice invalid, create new checkout
    }
  }

  const result = await createCheckout(quote);
  return {
    checkoutToken: result.checkoutToken,
    invoiceId: result.invoiceId,
    paymentLink: result.paymentLink,
  };
}

// ── Webhook Handling ────────────────────────────────────────────────

export async function handleInvoicePaid(invoiceId: string) {
  const quote = await quoteService.markQuotePaid(invoiceId);
  return quote;
}

export async function handlePaymentFailed(invoiceId: string) {
  const quote = await quoteService.getQuoteByAPInvoice(invoiceId);
  if (quote) {
    await quoteService.updateQuoteStatus(quote.quoteNumber, 'accepted');
  }
}

// ── Line Item Builder ───────────────────────────────────────────────

function buildLineItems(quote: QuoteData) {
  // AP's invoice API takes line-item `amount` in dollars (decimal), not cents.
  // Earlier code multiplied by 100 thinking AP was Stripe-style cents — that
  // was wrong and caused invoices to render at 100× the intended amount.
  // Round to 2dp to avoid float drift.
  const dollars = (n: number) => Math.round(n * 100) / 100;
  const items: Array<{ description: string; amount: number; quantity: number }> = [];

  // 1. Onboarding & Setup (one-time). Skipped when waived — finalCost = 0
  //    for portal quotes (per NTM policy).
  if (quote.onboarding.finalCost > 0) {
    items.push({
      description: `Onboarding & Setup (${quote.onboarding.userCount} users)`,
      amount: dollars(quote.onboarding.finalCost),
      quantity: 1,
    });
  }

  // 2. One-time addons (legacy placeholder addons; current NTM catalog has none)
  for (const addon of quote.selectedAddons) {
    if (addon.pricingType === 'one-time-only') {
      const amount = addon.setupPrice ?? addon.price;
      if (amount && amount > 0) {
        items.push({
          description: addon.name,
          amount: dollars(amount),
          quantity: addon.quantity,
        });
      }
    }

    // 3. Setup fees from dual-pricing addons (also legacy)
    if (addon.pricingType === 'both' && addon.setupPrice && addon.setupPrice > 0) {
      items.push({
        description: `${addon.name} - Setup Fee`,
        amount: dollars(addon.setupPrice),
        quantity: addon.quantity,
      });
    }
  }

  // 3b. One-time custom line items (staff-added). Recurring custom items are
  //     folded into totals.recurringCosts and billed via line 4 + the CW
  //     agreement; the one-time portion is charged here.
  for (const item of quote.customItems ?? []) {
    const oneTime = Number(item.oneTimePrice) || 0;
    if (oneTime > 0) {
      items.push({
        description: item.name,
        amount: dollars(oneTime),
        quantity: Number(item.quantity) || 1,
      });
    }
  }

  // 4. First month's recurring charge — captured upfront via AP so the customer
  //    has paid something real even when onboarding is waived. CW agreement
  //    handles months 2+. Composed of package recurring + recurring addons +
  //    recurring custom items (all already folded into totals.recurringCosts).
  if (quote.totals.recurringCosts > 0) {
    items.push({
      description: `First month — ${quote.selectedPackage?.name ?? 'Recurring services'}`,
      amount: dollars(quote.totals.recurringCosts),
      quantity: 1,
    });
  }

  return items;
}
