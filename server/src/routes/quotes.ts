import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { optionalAuth } from '../middleware/auth.js';
import { env } from '../config/env.js';
import * as quoteService from '../services/quote.service.js';
import * as emailService from '../services/email.service.js';
import * as apService from '../services/ap.service.js';
import * as cwService from '../services/connectwise.service.js';
import * as ghlService from '../services/crm.service.js';

const router = Router();

const createQuoteSchema = z.object({
  customer: z
    .object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().min(1),
      businessName: z.string().min(1),
      address: z.string().min(1),
      // Desktop (Business Premium) user count. Optional — a quote may be sized
      // on Web Users or Locations alone (see refine below).
      userCount: z.number().int().min(0),
      // Web (F3) user count. Optional; 0 if the customer has no F3 users.
      webUserCount: z.number().int().min(0).optional().default(0),
      // Locations are optional — 0 means the customer has no site for us to
      // manage. A 0-location quote skips the per-location CW agreement line.
      locationCount: z.number().int().min(0),
      referrerCode: z.string().nullable().optional(),
    }),
  // Sizing gate lives in a superRefine below: package-bearing quotes need at
  // least one non-zero sizing dimension; package-less (admin) quotes don't —
  // their content is add-ons / custom items.
  // Nullable: an authenticated admin may create a quote with no package at
  // all (add-ons / custom items only). Public wizard always sends one — the
  // route handler enforces that for unauthenticated callers.
  selectedPackage: z
    .object({
      id: z.string(),
      name: z.string(),
      pricePerUser: z.number(),
      pricePerUserF3: z.number().optional(),
      pricePerLocation: z.number(),
      frequency: z.string(),
      features: z.array(z.string()),
      featureGroups: z
        .array(z.object({ category: z.string(), items: z.array(z.string()) }))
        .optional(),
      agreementMonths: z.number().int().min(0).optional(),
      calculatedPrice: z.number(),
    })
    .nullable(),
  selectedAddons: z.array(z.any()),
  onboarding: z.object({
    userCount: z.number(),
    costPerUser: z.number(),
    totalCost: z.number(),
    discount: z.number(),
    finalCost: z.number(),
  }),
  appliedPromoCodes: z.array(z.any()),
  totals: z.object({
    onboardingCost: z.number(),
    oneTimeCosts: z.number(),
    recurringCosts: z.number(),
    discount: z.number(),
    grandTotal: z.number(),
    recurringFrequency: z.string(),
  }),
  terms: z.object({
    version: z.string(),
    id: z.string(),
    url: z.string(),
    content: z.string(),
  }),
  // Optional — admin-created quotes can pre-assign a sales rep so the
  // auto-CC on send-quote works out of the box. Customer-built quotes
  // omit this; an admin can assign one later.
  salesRepId: z.string().nullable().optional(),
  // Admin-only (stripped for unauthenticated callers in the handler):
  // existing-CW-customer mode + optional pinned CW company/agreement ids.
  isExistingCustomer: z.boolean().optional(),
  cwCompanyId: z.number().int().positive().nullable().optional(),
  cwAgreementId: z.number().int().positive().nullable().optional(),
}).superRefine((payload, ctx) => {
  // A package-bearing quote must be sized on at least one dimension —
  // otherwise every package line is 0 and there's nothing to quote. A
  // package-less quote is sized by its add-ons / custom items instead.
  if (payload.selectedPackage) {
    const c = payload.customer;
    if (c.userCount <= 0 && (c.webUserCount ?? 0) <= 0 && c.locationCount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one of Desktop Users, Web Users, or Locations is required.',
        path: ['customer', 'userCount'],
      });
    }
  }
});

// Create a new quote
router.post('/api/quotes', optionalAuth, validate(createQuoteSchema), async (req, res) => {
  const isAdmin = !!req.admin;

  // Admin-only capabilities. Unauthenticated (customer wizard) callers can't
  // create package-less quotes or point provisioning at an arbitrary CW
  // company/agreement. REJECT rather than silently strip: the admin Create
  // Quote page submits through this route, and a session that expired mid-
  // build must not quietly downgrade an existing-customer quote to full
  // new-customer provisioning (duplicate company, new agreement, onboarding
  // template — everything the flag exists to prevent).
  if (!isAdmin) {
    if (!req.body.selectedPackage) {
      res.status(400).json({ error: 'selectedPackage is required' });
      return;
    }
    if (req.body.isExistingCustomer || req.body.cwCompanyId || req.body.cwAgreementId) {
      res.status(401).json({
        error:
          'Existing-customer quotes require an active admin session — your login may have expired. Sign in again and retry.',
      });
      return;
    }
  }

  const quote = await quoteService.createQuote(req.body);

  // Skip CW provisioning in lead-gen mode — the lite tool only collects
  // info and hands off via GHL. Sales reps create the CW records manually
  // after their follow-up call confirms scope and pricing.
  if (!env.LEAD_GEN_MODE) {
    cwService.onQuoteCreated(quote).then(async (cwIds) => {
      if (cwIds.cwCompanyId || cwIds.cwContactId || cwIds.cwOpportunityId) {
        await quoteService.updateQuoteCWIds(quote.quoteNumber, cwIds);
      }
    }).catch((err) => console.error('[CW] onQuoteCreated error:', err));
  }

  // GHL contact creation runs in both modes — lite quotes still need a
  // GHL contact so the tag-driven workflow (sales-rep follow-up) can fire.
  ghlService.onQuoteCreated(quote).then(async (ghlIds) => {
    if (ghlIds.ghlContactId || ghlIds.ghlOpportunityId) {
      await quoteService.updateQuoteGHLIds(quote.quoteNumber, ghlIds);
    }
  }).catch((err) => console.error('[GHL] onQuoteCreated error:', err));

  res.status(201).json(quote);
});

// Lookup quotes by email (public - for customers to find their quotes)
router.get('/api/quotes/lookup/by-email', async (req, res) => {
  const email = req.query.email as string;
  if (!email || !z.string().email().safeParse(email).success) {
    res.status(400).json({ error: 'Valid email address required' });
    return;
  }

  const quotes = await quoteService.getQuotesByEmail(email);
  res.json({ quotes });
});

// Strip staff-internal metadata from custom items before they leave on a
// public (unauthenticated) response: addedBy is an admin email, cwProductId
// an internal CW catalog id. The admin UI reads the raw rows via the
// authenticated /api/admin/quotes/:id route instead.
function sanitizeQuoteForPublic<T extends { customItems?: any[] }>(quote: T): T {
  return {
    ...quote,
    customItems: (quote.customItems ?? []).map(
      ({ addedBy, addedAt, cwProductId, ...rest }: any) => rest,
    ),
  };
}

// Get a quote by ID or quoteNumber
router.get('/api/quotes/:id', async (req, res) => {
  const id = req.params.id as string;
  const quote = await quoteService.getQuote(id);
  res.json(sanitizeQuoteForPublic(quote));
});

// Apply promo code to an existing quote
router.post('/api/quotes/:id/promo', async (req, res) => {
  const id = req.params.id as string;
  const { code } = z.object({ code: z.string().min(1) }).parse(req.body);

  const quote = await quoteService.getQuote(id);
  const result = await quoteService.applyPromoCode(quote.quoteNumber, code);
  res.json(result);
});

// Remove promo code from an existing quote
router.delete('/api/quotes/:id/promo', async (req, res) => {
  const id = req.params.id as string;
  const { code } = z.object({ code: z.string().min(1) }).parse(req.body);

  const quote = await quoteService.getQuote(id);
  const result = await quoteService.removePromoCode(quote.quoteNumber, code);
  res.json(result);
});

// Email a quote — optional `additionalTo` and `cc` arrays let admins
// send the same quote link to extra recipients (e.g. assigned sales rep,
// other decision-makers on the customer side).
const emailQuoteBodySchema = z
  .object({
    additionalTo: z.array(z.string().email()).optional(),
    cc: z.array(z.string().email()).optional(),
  })
  .optional()
  .default({});

router.post('/api/quotes/:id/email', async (req, res) => {
  const id = req.params.id as string;
  const body = emailQuoteBodySchema.parse(req.body ?? {});
  const quote = await quoteService.getQuote(id);
  await quoteService.updateQuoteStatus(quote.quoteNumber, 'sent');

  // Auto-CC the assigned sales rep, if any, so they always get a copy
  // without the admin having to type their address every time. Caller-
  // supplied CCs stack on top.
  const repEmail = quote.salesRep?.email;
  const cc = [...(body.cc ?? [])];
  if (repEmail) cc.push(repEmail);

  const emailResult = await emailService.sendQuoteEmail(
    { ...quote, status: 'sent' },
    { additionalTo: body.additionalTo, cc },
  );

  // Fire-and-forget: GHL note
  ghlService.onQuoteEmailed(quote).catch((err) => console.error('[GHL] onQuoteEmailed error:', err));

  if (emailResult.skipped) {
    res.json({ success: true, skipped: true, message: 'Email service not configured', quoteUrl: `${process.env.FRONTEND_URL || ''}/quote-review?id=${quote.quoteNumber}` });
  } else {
    res.json({
      success: true,
      quoteUrl: `${process.env.FRONTEND_URL || ''}/quote-review?id=${quote.quoteNumber}`,
      to: emailResult.to,
      cc: emailResult.cc,
    });
  }
});

// Lite quoting tool: customer clicked "Request Follow-up from Sales Rep".
// Tags the GHL contact, drops a note, and returns the booking URL the
// frontend should open. No payment, no contract.
router.post('/api/quotes/:id/request-followup', async (req, res) => {
  if (!env.LEAD_GEN_MODE) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const id = req.params.id as string;
  const quote = await quoteService.getQuote(id);

  ghlService
    .markLiteLeadSubmitted(quote)
    .catch((err) => console.error('[GHL] markLiteLeadSubmitted error:', err));

  await quoteService.updateQuoteStatus(quote.quoteNumber, 'sent');

  const calendarId = 'snhTg4zQQSVrJ9R3jisc';
  const bookingUrl =
    env.GHL_BOOKING_URL ||
    `https://api.leadconnectorhq.com/widget/booking/${calendarId}`;

  res.json({ success: true, bookingUrl });
});

// Checkout — create Alternative Payments session
router.post('/api/quotes/:id/checkout', async (req, res) => {
  if (env.LEAD_GEN_MODE) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const agreementSchema = z.object({
    agreement: z.object({
      signedBy: z.string().min(3),
      email: z.string().email(),
      agreedToTerms: z.literal(true),
      termsVersion: z.string(),
      termsId: z.string(),
      termsUrl: z.string(),
      termsContent: z.string(),
      signedAt: z.string(),
      ipAddress: z.string(),
      userAgent: z.string(),
      // Optional rasterized handwritten signature (PNG data URL). Capped
      // at ~750KB raw — a normal signature canvas runs well under that;
      // anything larger is almost certainly junk and we reject it before
      // it lands in the Json column.
      signatureImage: z
        .string()
        .max(1_000_000)
        .regex(/^data:image\/png;base64,/)
        .optional(),
    }),
    orderNumber: z.string(),
  });

  const payload = agreementSchema.parse(req.body);
  const quoteId = req.params.id as string;

  // Guard BEFORE persisting the signature: a fully-stripped quote can total
  // $0 (no package, no addons, no custom items yet) and AP rejects empty
  // invoices — signing first would strand the quote in 'accepted' with a
  // stored signature and no payment path.
  const existing = await quoteService.getQuote(quoteId);
  if ((existing.totals?.grandTotal ?? 0) <= 0) {
    res.status(400).json({
      error:
        'This quote has no payable items yet. Contact us to finalize the quote before signing.',
    });
    return;
  }

  const quote = await quoteService.updateQuoteAgreement(quoteId, payload);
  const result = await apService.createCheckout(quote);

  res.json({
    checkoutToken: result.checkoutToken,
    invoiceId: result.invoiceId,
    paymentLink: result.paymentLink,
  });
});

// Get or refresh payment link
router.get('/api/quotes/:id/payment-link', async (req, res) => {
  if (env.LEAD_GEN_MODE) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const id = req.params.id as string;
  const quote = await quoteService.getQuote(id);
  if ((quote.totals?.grandTotal ?? 0) <= 0) {
    res.status(400).json({ error: 'This quote has no payable items yet.' });
    return;
  }
  const result = await apService.getOrCreatePaymentLink(quote);
  res.json({
    checkoutToken: result.checkoutToken,
    invoiceId: result.invoiceId,
    paymentLink: result.paymentLink,
  });
});

export default router;
