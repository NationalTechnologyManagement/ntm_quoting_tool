import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { env } from '../config/env.js';
import * as quoteService from '../services/quote.service.js';
import * as emailService from '../services/email.service.js';
import * as apService from '../services/ap.service.js';
import * as cwService from '../services/connectwise.service.js';
import * as ghlService from '../services/crm.service.js';

const router = Router();

const createQuoteSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    businessName: z.string().min(1),
    address: z.string().min(1),
    // Desktop (Business Premium) user count. The flow requires at least one,
    // enforced UI-side too.
    userCount: z.number().int().min(1),
    // Web (F3) user count. Optional; 0 if the customer has no F3 users.
    webUserCount: z.number().int().min(0).optional().default(0),
    locationCount: z.number().int().min(1),
    referrerCode: z.string().nullable().optional(),
  }),
  selectedPackage: z.object({
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
  }),
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
});

// Create a new quote
router.post('/api/quotes', validate(createQuoteSchema), async (req, res) => {
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

// Get a quote by ID or quoteNumber
router.get('/api/quotes/:id', async (req, res) => {
  const id = req.params.id as string;
  const quote = await quoteService.getQuote(id);
  res.json(quote);
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

// Email a quote
router.post('/api/quotes/:id/email', async (req, res) => {
  const id = req.params.id as string;
  const quote = await quoteService.getQuote(id);
  await quoteService.updateQuoteStatus(quote.quoteNumber, 'sent');

  const emailResult = await emailService.sendQuoteEmail({ ...quote, status: 'sent' });

  // Fire-and-forget: GHL note
  ghlService.onQuoteEmailed(quote).catch((err) => console.error('[GHL] onQuoteEmailed error:', err));

  if (emailResult.skipped) {
    res.json({ success: true, skipped: true, message: 'Email service not configured', quoteUrl: `${process.env.FRONTEND_URL || ''}/quote-review?id=${quote.quoteNumber}` });
  } else {
    res.json({ success: true, quoteUrl: `${process.env.FRONTEND_URL || ''}/quote-review?id=${quote.quoteNumber}` });
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
    }),
    orderNumber: z.string(),
  });

  const payload = agreementSchema.parse(req.body);
  const quoteId = req.params.id as string;
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
  const result = await apService.getOrCreatePaymentLink(quote);
  res.json({
    checkoutToken: result.checkoutToken,
    invoiceId: result.invoiceId,
    paymentLink: result.paymentLink,
  });
});

export default router;
