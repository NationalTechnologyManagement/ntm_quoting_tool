import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { replayProvisioning, reprovisionFromScratch } from '../services/connectwise.service.js';
import { getAllSteps } from '../services/cw-state.service.js';
import * as quoteService from '../services/quote.service.js';
import * as contractService from '../services/contract.service.js';
import * as pdfService from '../services/pdf.service.js';
import * as emailService from '../services/email.service.js';
import * as apService from '../services/ap.service.js';
import { QUOTE_VALIDITY_DAYS } from '@ntm/shared';

const router = Router();

// List all quotes with search, filter, pagination
router.get('/api/admin/quotes', requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const where: any = {};

  if (status && status !== 'all') {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { quoteNumber: { contains: search, mode: 'insensitive' } },
      { orderNumber: { contains: search, mode: 'insensitive' } },
      // Search within JSON customer field
      { customer: { path: ['email'], string_contains: search } },
      { customer: { path: ['businessName'], string_contains: search } },
      { customer: { path: ['name'], string_contains: search } },
    ];
  }

  const [quotes, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        customer: true,
        orderNumber: true,
        totals: true,
        selectedPackage: true,
        apInvoiceId: true,
        cwCompanyId: true,
        cwOpportunityId: true,
        ghlContactId: true,
        provisioningStatus: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { contracts: true } },
      },
    }),
    prisma.quote.count({ where }),
  ]);

  res.json({
    quotes,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// Get single quote full details (admin)
router.get('/api/admin/quotes/:id', requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const quote = await prisma.quote.findFirst({
    where: { OR: [{ id }, { quoteNumber: id }] },
    include: {
      contracts: true,
      provisioningSteps: { orderBy: { updatedAt: 'asc' } },
      amendments: {
        select: { id: true, quoteNumber: true, status: true, totals: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
      salesRep: { select: { id: true, email: true, name: true } },
    },
  });

  if (!quote) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }

  res.json(quote);
});

// Assign / unassign the sales rep on a quote. salesRepId=null clears it.
const assignSalesRepSchema = z.object({
  salesRepId: z.string().nullable(),
});
router.patch(
  '/api/admin/quotes/:id/sales-rep',
  requireAuth,
  validate(assignSalesRepSchema),
  async (req, res) => {
    const id = req.params.id as string;
    const quote = await prisma.quote.findFirst({
      where: { OR: [{ id }, { quoteNumber: id }] },
      select: { quoteNumber: true },
    });
    if (!quote) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    const updated = await quoteService.assignSalesRep(quote.quoteNumber, req.body.salesRepId);
    res.json(updated);
  },
);

// CW provisioning step state for a quote (used by admin UI's retry view)
router.get('/api/admin/quotes/:id/provisioning', requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const quote = await prisma.quote.findFirst({
    where: { OR: [{ id }, { quoteNumber: id }] },
    select: { id: true, quoteNumber: true, provisioningStatus: true },
  });
  if (!quote) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }
  const steps = await getAllSteps(quote.id);
  res.json({
    quoteNumber: quote.quoteNumber,
    provisioningStatus: quote.provisioningStatus,
    steps,
  });
});

// ── Custom line items (NTM staff-added) ─────────────────────────────
// Lets ops add a one-off charge (recurring or one-time) to an existing quote
// that isn't part of the standard package/addon catalog. Recalculates totals
// after each change. Custom items are billed via AP on the next invoice (if
// one-time) or rolled into the CW agreement Additions (if recurring).

const customItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  quantity: z.number().int().min(1),
  recurringPrice: z.number().nullable().optional(),
  recurringFrequency: z.enum(['monthly', 'annually']).nullable().optional(),
  oneTimePrice: z.number().nullable().optional(),
});

router.post(
  '/api/admin/quotes/:id/custom-items',
  requireAuth,
  validate(customItemSchema),
  async (req, res) => {
    const id = req.params.id as string;
    const item = req.body as z.infer<typeof customItemSchema>;
    if ((item.recurringPrice ?? 0) <= 0 && (item.oneTimePrice ?? 0) <= 0) {
      res.status(400).json({ error: 'Item needs at least one price (recurring or one-time)' });
      return;
    }
    const quote = await prisma.quote.findFirst({
      where: { OR: [{ id }, { quoteNumber: id }] },
    });
    if (!quote) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    const existing = (quote.customItems as any[]) ?? [];
    const newItem = {
      id: `custom-${Date.now()}`,
      ...item,
      addedBy: req.admin?.email ?? 'admin',
      addedAt: new Date().toISOString(),
    };
    const customItems = [...existing, newItem];
    const totals = recalcTotalsWithCustom(quote, customItems);
    await prisma.quote.update({
      where: { id: quote.id },
      data: { customItems, totals },
    });
    res.json({ success: true, item: newItem, totals });
  },
);

router.delete('/api/admin/quotes/:id/custom-items/:itemId', requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const itemId = req.params.itemId as string;
  const quote = await prisma.quote.findFirst({
    where: { OR: [{ id }, { quoteNumber: id }] },
  });
  if (!quote) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }
  const existing = (quote.customItems as any[]) ?? [];
  const customItems = existing.filter((i) => i.id !== itemId);
  const totals = recalcTotalsWithCustom(quote, customItems);
  await prisma.quote.update({
    where: { id: quote.id },
    data: { customItems, totals },
  });
  res.json({ success: true, totals });
});

function recalcTotalsWithCustom(quote: any, customItems: any[]) {
  // Start from the snapshotted base costs (package + addons), then add custom
  // items on top. Onboarding and one-time addon costs are read from the
  // existing totals (which already include the portal-waiver if applicable).
  const baseRecurring = (quote.totals?.recurringCosts ?? 0) - sumCustomRecurring((quote.customItems as any[]) ?? []);
  const baseOneTime = (quote.totals?.oneTimeCosts ?? 0) - sumCustomOneTime((quote.customItems as any[]) ?? []);
  const customRecurring = sumCustomRecurring(customItems);
  const customOneTime = sumCustomOneTime(customItems);
  return {
    ...quote.totals,
    recurringCosts: Math.max(0, baseRecurring) + customRecurring,
    oneTimeCosts: Math.max(0, baseOneTime) + customOneTime,
  };
}

function sumCustomRecurring(items: any[]): number {
  return items.reduce((sum, i) => sum + (Number(i.recurringPrice) || 0) * (Number(i.quantity) || 1), 0);
}
function sumCustomOneTime(items: any[]): number {
  return items.reduce((sum, i) => sum + (Number(i.oneTimePrice) || 0) * (Number(i.quantity) || 1), 0);
}

// ── Admin quote edits ───────────────────────────────────────────────
// Admin can adjust the package, sizing, addons, contract term, and price
// snapshots on an existing quote. If the quote is still in a pre-paid
// state (draft/sent/accepted/checkout_pending) the change is applied in
// place. If the quote has already been paid we leave it alone and create
// a fresh amendment quote linked back via parentQuoteId, plus a new AP
// invoice for the recurring delta + any new one-time charges.

const editSelectedPackageSchema = z.object({
  id: z.string(),
  name: z.string(),
  pricePerUser: z.number().min(0),
  pricePerUserF3: z.number().min(0).optional(),
  pricePerLocation: z.number().min(0),
  frequency: z.string(),
  features: z.array(z.string()),
  featureGroups: z
    .array(z.object({ category: z.string(), items: z.array(z.string()) }))
    .optional(),
  agreementMonths: z.number().int().min(0).optional(),
  calculatedPrice: z.number().min(0).optional(),
});

const editSelectedAddonSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().default(''),
  price: z.number().min(0).optional().default(0),
  quantity: z.number().int().min(1),
  frequency: z.string().optional().default('monthly'),
  pricingType: z.enum(['recurring-only', 'one-time-only', 'both']),
  recurringPrice: z.number().nullable().optional(),
  recurringFrequency: z.string().nullable().optional(),
  setupPrice: z.number().nullable().optional(),
});

const editQuoteSchema = z.object({
  userCount: z.number().int().min(1).optional(),
  webUserCount: z.number().int().min(0).optional(),
  locationCount: z.number().int().min(1).optional(),
  selectedPackage: editSelectedPackageSchema.optional(),
  selectedAddons: z.array(editSelectedAddonSchema).optional(),
  // Admin can also flip the contract term on the snapshotted package
  // without changing anything else. agreementMonths on selectedPackage
  // takes precedence if both are present.
  agreementMonths: z.number().int().min(0).optional(),
  // Free-text notes shown to the customer on the review page and copied
  // into the contract PDF. Optional — pass null to clear.
  notes: z.string().max(5000).nullable().optional(),
  // When true and the quote is paid, the server creates an amendment quote.
  // Default true so the caller doesn't need to know the quote's status.
  amendIfPaid: z.boolean().optional().default(true),
});

function computeQuoteTotals(input: {
  pkg: any;
  addons: any[];
  userCount: number;
  webUserCount: number;
  locationCount: number;
  appliedPromoCodes: any[];
  waiveOnboarding: boolean;
}) {
  const { pkg, addons, userCount, webUserCount, locationCount, appliedPromoCodes, waiveOnboarding } = input;
  const packageCost =
    (Number(pkg.pricePerUser) || 0) * userCount +
    (Number(pkg.pricePerUserF3) || 0) * webUserCount +
    (Number(pkg.pricePerLocation) || 0) * locationCount;
  const addonRecurring = addons
    .filter((a) => a.pricingType === 'recurring-only' || a.pricingType === 'both')
    .reduce((sum, a) => sum + (Number(a.recurringPrice) || 0) * (Number(a.quantity) || 1), 0);
  const addonOneTime = addons
    .filter((a) => a.pricingType === 'one-time-only' || a.pricingType === 'both')
    .reduce((sum, a) => sum + (Number(a.setupPrice) || 0) * (Number(a.quantity) || 1), 0);

  const baseRecurring = packageCost + addonRecurring;
  const baseOneTime = addonOneTime;
  const baseOnboarding = waiveOnboarding ? 0 : packageCost * 2; // 2x monthly per NTM policy

  let onboardingDiscount = 0;
  let oneTimeDiscount = 0;
  let recurringDiscount = 0;
  for (const p of appliedPromoCodes) {
    const pct = p.discountType === 'percentage';
    const amt = Number(p.discount) || 0;
    if (p.applyTo === 'onboarding') {
      onboardingDiscount += pct ? baseOnboarding * (amt / 100) : Math.min(amt, baseOnboarding - onboardingDiscount);
    } else if (p.applyTo === 'one-time') {
      oneTimeDiscount += pct ? baseOneTime * (amt / 100) : Math.min(amt, baseOneTime - oneTimeDiscount);
    } else if (p.applyTo === 'monthly') {
      recurringDiscount += pct ? baseRecurring * (amt / 100) : Math.min(amt, baseRecurring - recurringDiscount);
    }
  }

  const finalOnboarding = Math.max(0, baseOnboarding - onboardingDiscount);
  const finalOneTime = Math.max(0, baseOneTime - oneTimeDiscount);
  const finalRecurring = Math.max(0, baseRecurring - recurringDiscount);

  return {
    onboarding: {
      userCount,
      costPerUser: userCount > 0 ? baseOnboarding / userCount : 0,
      totalCost: baseOnboarding,
      discount: onboardingDiscount + (waiveOnboarding ? packageCost * 2 : 0),
      finalCost: finalOnboarding,
    },
    totals: {
      onboardingCost: finalOnboarding,
      oneTimeCosts: finalOneTime,
      recurringCosts: finalRecurring,
      discount: onboardingDiscount + oneTimeDiscount + recurringDiscount,
      grandTotal: finalOnboarding + finalOneTime + finalRecurring,
      recurringFrequency: 'monthly',
    },
  };
}

function genQuoteNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `QT-${date}-${rand}`;
}

// Re-snapshot a quote's selectedPackage from the live catalog. Pulls the
// current package row and overwrites the quote's snapshot with its
// pricePerUser / pricePerUserF3 / pricePerLocation / features /
// featureGroups / agreementMonths. Totals are recomputed against the
// fresh values. Use after editing a package's pricing or features when
// existing quotes need to reflect those changes without a manual edit.
router.post('/api/admin/quotes/:id/refresh-package', requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const quote = await prisma.quote.findFirst({
    where: { OR: [{ id }, { quoteNumber: id }] },
  });
  if (!quote) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }
  const snapshotPkg = quote.selectedPackage as any;
  if (!snapshotPkg?.id) {
    res.status(400).json({ error: 'Quote has no selected package to refresh' });
    return;
  }
  const live = await prisma.package.findUnique({ where: { id: snapshotPkg.id } });
  if (!live) {
    res.status(404).json({
      error: `Package ${snapshotPkg.id} no longer exists in the catalog.`,
    });
    return;
  }
  const customer = quote.customer as any;
  const userCount = Number(customer?.userCount ?? 1);
  const webUserCount = Number(customer?.webUserCount ?? 0);
  const locationCount = Number(customer?.locationCount ?? 1);
  const editedPkg = {
    ...snapshotPkg,
    name: live.name,
    pricePerUser: live.pricePerUser,
    pricePerUserF3: live.pricePerUserF3,
    pricePerLocation: live.pricePerLocation,
    frequency: live.frequency,
    features: live.features ?? [],
    featureGroups: (live as any).featureGroups ?? [],
    agreementMonths: live.agreementMonths,
    calculatedPrice:
      live.pricePerUser * userCount +
      (live.pricePerUserF3 ?? 0) * webUserCount +
      live.pricePerLocation * locationCount,
  };
  const waiveOnboarding = ((quote.onboarding as any)?.finalCost ?? 0) === 0;
  const recomputed = computeQuoteTotals({
    pkg: editedPkg,
    addons: (quote.selectedAddons as any[]) ?? [],
    userCount,
    webUserCount,
    locationCount,
    appliedPromoCodes: (quote.appliedPromoCodes as any[]) ?? [],
    waiveOnboarding,
  });
  const updated = await prisma.quote.update({
    where: { id: quote.id },
    data: {
      selectedPackage: editedPkg as any,
      onboarding: recomputed.onboarding as any,
      totals: recomputed.totals as any,
    },
  });
  res.json({
    success: true,
    quote: updated,
    refreshedFrom: {
      pricePerUser: live.pricePerUser,
      pricePerUserF3: live.pricePerUserF3,
      pricePerLocation: live.pricePerLocation,
      featureGroups: (live as any).featureGroups ?? [],
    },
  });
});

router.put(
  '/api/admin/quotes/:id',
  requireAuth,
  validate(editQuoteSchema),
  async (req, res) => {
    const id = req.params.id as string;
    const body = req.body as z.infer<typeof editQuoteSchema>;

    const quote = await prisma.quote.findFirst({
      where: { OR: [{ id }, { quoteNumber: id }] },
    });
    if (!quote) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }

    const customer = quote.customer as any;
    const currentPkg = quote.selectedPackage as any;
    const currentAddons = (quote.selectedAddons as any[]) ?? [];

    const userCount = body.userCount ?? customer?.userCount ?? 1;
    const webUserCount = body.webUserCount ?? customer?.webUserCount ?? 0;
    const locationCount = body.locationCount ?? customer?.locationCount ?? 1;

    const editedPkg = body.selectedPackage
      ? { ...body.selectedPackage }
      : { ...currentPkg };
    if (body.agreementMonths !== undefined && body.selectedPackage === undefined) {
      editedPkg.agreementMonths = body.agreementMonths;
    }
    editedPkg.calculatedPrice =
      Number(editedPkg.pricePerUser ?? 0) * userCount +
      Number(editedPkg.pricePerUserF3 ?? 0) * webUserCount +
      Number(editedPkg.pricePerLocation ?? 0) * locationCount;

    const editedAddons = (body.selectedAddons ?? currentAddons).map((a: any) => {
      const qty = Number(a.quantity) || 1;
      const recurring = Number(a.recurringPrice) || 0;
      const setup = Number(a.setupPrice) || 0;
      return {
        ...a,
        quantity: qty,
        totalPrice: (Number(a.price) || recurring || setup) * qty,
        totalRecurringCost: recurring * qty,
        totalSetupCost: setup * qty,
      };
    });

    // Onboarding waiver mirrors the original quote's policy — most portal
    // quotes have it waived. We read the waiver state off the existing
    // snapshot rather than re-deriving so admin edits don't accidentally
    // change the fee policy on the customer.
    const waiveOnboarding = ((quote.onboarding as any)?.finalCost ?? 0) === 0;

    const recomputed = computeQuoteTotals({
      pkg: editedPkg,
      addons: editedAddons,
      userCount,
      webUserCount,
      locationCount,
      appliedPromoCodes: (quote.appliedPromoCodes as any[]) ?? [],
      waiveOnboarding,
    });

    const isPaid = quote.status === 'paid';

    if (isPaid && body.amendIfPaid !== false) {
      // Amendment path: clone a new quote pointing back at the original.
      // Carry over customer + terms snapshots; reset payment fields so a
      // fresh AP invoice can be minted for the delta. Status starts as
      // 'accepted' since the customer already signed the parent contract
      // and we just need a payment from them on the difference.
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + QUOTE_VALIDITY_DAYS);

      const newCustomer = { ...customer, userCount, webUserCount, locationCount };
      const nextNotes = body.notes !== undefined ? body.notes : quote.notes;

      const created = await prisma.quote.create({
        data: {
          quoteNumber: genQuoteNumber(),
          status: 'accepted',
          customer: newCustomer as any,
          selectedPackage: editedPkg as any,
          selectedAddons: editedAddons as any,
          onboarding: recomputed.onboarding as any,
          appliedPromoCodes: quote.appliedPromoCodes as any,
          totals: recomputed.totals as any,
          terms: quote.terms as any,
          parentQuoteId: quote.id,
          notes: nextNotes,
          expiresAt,
        },
      });

      // Compute the delta and stand up a fresh AP invoice on it. Recurring
      // delta is billed as one month upfront so the customer pays the
      // difference now — CW handles ongoing months on the agreement side.
      const parentTotals = (quote.totals as any) ?? {};
      const recurringDelta = Math.max(
        0,
        (recomputed.totals.recurringCosts ?? 0) - (parentTotals.recurringCosts ?? 0),
      );
      const oneTimeDelta = Math.max(
        0,
        (recomputed.totals.oneTimeCosts ?? 0) - (parentTotals.oneTimeCosts ?? 0),
      );

      let amendmentInvoice: { invoiceId: string; paymentLink: string } | null = null;
      let amendmentInvoiceError: string | null = null;

      if (recurringDelta > 0 || oneTimeDelta > 0) {
        try {
          // Build a quote-shaped object whose totals reflect *just* the delta.
          // apService.createCheckout calls updateQuoteAPSession internally,
          // which will persist the AP ids on the new amendment row.
          const quoteShapeForAp = await quoteService.getQuote(created.quoteNumber);
          const deltaQuote = {
            ...quoteShapeForAp,
            totals: {
              ...quoteShapeForAp.totals,
              onboardingCost: 0, // amendments never re-charge onboarding
              oneTimeCosts: oneTimeDelta,
              recurringCosts: recurringDelta,
              grandTotal: oneTimeDelta + recurringDelta,
            },
            onboarding: { ...quoteShapeForAp.onboarding, finalCost: 0 },
          };
          const result = await apService.createCheckout(deltaQuote);
          amendmentInvoice = { invoiceId: result.invoiceId, paymentLink: result.paymentLink };
        } catch (err: any) {
          amendmentInvoiceError = err?.message ?? String(err);
          console.error('[admin-edit] amendment invoice failed:', err);
        }
      }

      res.json({
        mode: 'amendment',
        amendment: created,
        delta: { recurring: recurringDelta, oneTime: oneTimeDelta },
        invoice: amendmentInvoice,
        invoiceError: amendmentInvoiceError,
      });
      return;
    }

    // In-place update path: quote isn't paid yet, just rewrite the snapshot.
    const updated = await prisma.quote.update({
      where: { id: quote.id },
      data: {
        customer: { ...customer, userCount, webUserCount, locationCount } as any,
        selectedPackage: editedPkg as any,
        selectedAddons: editedAddons as any,
        onboarding: recomputed.onboarding as any,
        totals: recomputed.totals as any,
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });

    res.json({ mode: 'in_place', quote: updated });
  },
);

// Hard-delete a quote. Cascades through contracts and CW provisioning step
// rows in a transaction. Records that already exist in CW (companies,
// opportunities, agreements, projects) are NOT touched — those would need to
// be archived/cancelled in CW separately.
router.delete('/api/admin/quotes/:id', requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const quote = await prisma.quote.findFirst({
    where: { OR: [{ id }, { quoteNumber: id }] },
    select: { id: true, quoteNumber: true },
  });
  if (!quote) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }
  await prisma.$transaction([
    prisma.contract.deleteMany({ where: { quoteId: quote.id } }),
    prisma.cwProvisioningStep.deleteMany({ where: { quoteId: quote.id } }),
    prisma.quote.delete({ where: { id: quote.id } }),
  ]);
  res.json({ success: true, deletedQuoteNumber: quote.quoteNumber });
});

// Admin-only: pretend the quote was paid via AP without actually charging
// anyone. Runs the full post-payment flow: marks quote paid + mints order
// number, regenerates the contract PDF and emails it, then runs the CW
// provisioning orchestration end-to-end. If the quote already has dry-run
// sentinel CW ids on it, you can pass `reprovision: true` in the body to
// wipe the sentinels first and re-run the entire CW orchestration from
// scratch (use this when flipping CW_DRY_RUN false on a previously
// dry-run-tested quote).
const simulatePaymentSchema = z.object({
  reprovision: z.boolean().optional(),
});

router.post(
  '/api/admin/quotes/:id/simulate-payment',
  requireAuth,
  validate(simulatePaymentSchema),
  async (req, res) => {
    const id = req.params.id as string;
    const { reprovision } = req.body as z.infer<typeof simulatePaymentSchema>;

    const dbQuote = await prisma.quote.findFirst({
      where: { OR: [{ id }, { quoteNumber: id }] },
    });
    if (!dbQuote) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }

    // Mint an order number if missing and flip status to paid in DB. Doesn't
    // touch AP — purely local state. Mirrors what apService.handleInvoicePaid
    // does on a real webhook.
    if (!dbQuote.orderNumber) {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const suffix = Math.floor(1000 + Math.random() * 9000);
      await prisma.quote.update({
        where: { id: dbQuote.id },
        data: { orderNumber: `OR-${dateStr}-${suffix}`, status: 'paid' },
      });
    } else {
      await prisma.quote.update({
        where: { id: dbQuote.id },
        data: { status: 'paid' },
      });
    }

    // Generate contract PDF + email (best-effort; non-fatal if they fail)
    let contractEmailed = false;
    try {
      const quoteData = await quoteService.getQuote(dbQuote.quoteNumber);
      const html = contractService.buildContractHtml(quoteData);
      const pdfBuffer = await pdfService.generatePdf(html);
      await prisma.contract.create({
        data: {
          quoteId: dbQuote.id,
          pdfData: new Uint8Array(pdfBuffer),
          emailedAt: new Date(),
        },
      });
      await emailService.sendContractEmail(quoteData, pdfBuffer);
      contractEmailed = true;
    } catch (err) {
      console.error('[simulate-payment] contract/email step failed:', err);
    }

    // CW provisioning. Either resume from current step state or scrap and
    // start over from onQuoteCreated.
    let cwResult: any;
    try {
      if (reprovision) {
        cwResult = await reprovisionFromScratch(dbQuote.quoteNumber);
      } else {
        await replayProvisioning(dbQuote.quoteNumber);
        cwResult = { replayed: true };
      }
    } catch (err: any) {
      cwResult = { error: err?.message ?? String(err) };
    }

    res.json({
      quoteNumber: dbQuote.quoteNumber,
      contractEmailed,
      cw: cwResult,
    });
  },
);

// Manual replay of CW provisioning. Resets failed steps to pending and re-runs
// the pipeline. Successful steps short-circuit via the resume logic.
router.post('/api/admin/quotes/:id/retry-provisioning', requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const quote = await prisma.quote.findFirst({
    where: { OR: [{ id }, { quoteNumber: id }] },
    select: { quoteNumber: true },
  });
  if (!quote) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }
  try {
    await replayProvisioning(quote.quoteNumber);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

// Get quote status counts for dashboard
router.get('/api/admin/quotes/stats/summary', requireAuth, async (_req, res) => {
  const [counts, recentTotal] = await Promise.all([
    prisma.quote.groupBy({
      by: ['status'],
      _count: true,
    }),
    prisma.quote.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  let total = 0;
  for (const c of counts) {
    statusCounts[c.status] = c._count;
    total += c._count;
  }

  res.json({ statusCounts, total, last30Days: recentTotal });
});

// Clear (delete) all provisioning_step_failed AuditLog rows. Admin button
// behind a confirmation prompt; useful after resolving a batch of issues
// so the Logs page only shows fresh failures.
router.delete('/api/admin/provisioning-errors', requireAuth, async (_req, res) => {
  const deleted = await prisma.auditLog.deleteMany({
    where: { action: 'provisioning_step_failed' },
  });
  res.json({ success: true, deleted: deleted.count });
});

// List admin-only promo codes — used by QuoteDetail's edit panel to render
// the "Apply admin-only promo" picker. Public /api/config and the
// customer-facing validate route hide these.
router.get('/api/admin/admin-only-promos', requireAuth, async (_req, res) => {
  const promos = await prisma.promoCode.findMany({
    where: { adminOnly: true, active: true },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      discount: true,
      discountType: true,
      applyTo: true,
      cwProductId: true,
    },
  });
  res.json({ promos });
});

// Apply an admin-only promo to a quote. Reuses the existing
// quoteService.applyPromoCode path which validates + recomputes totals,
// but bypasses the public adminOnly guard by reading the row directly.
router.post(
  '/api/admin/quotes/:id/admin-promo',
  requireAuth,
  validate(z.object({ code: z.string().min(1) })),
  async (req, res) => {
    const id = req.params.id as string;
    const { code } = req.body as { code: string };

    const promo = await prisma.promoCode.findFirst({
      where: { code: { equals: code, mode: 'insensitive' }, active: true },
    });
    if (!promo) {
      res.status(404).json({ error: 'Promo code not found' });
      return;
    }

    const quote = await prisma.quote.findFirst({
      where: { OR: [{ id }, { quoteNumber: id }] },
    });
    if (!quote) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }

    const existing = (quote.appliedPromoCodes as any[]) ?? [];
    if (existing.some((p) => p.code?.toUpperCase() === promo.code.toUpperCase())) {
      res.status(400).json({ error: 'Promo code already applied to this quote' });
      return;
    }

    // Snapshot the promo onto the quote (same shape the customer-facing
    // applyPromoCode uses). cwProductId carried along so postAdditions can
    // emit the negative-priced discount line on CW later.
    const newPromos = [
      ...existing,
      {
        code: promo.code,
        discount: promo.discount,
        discountType: promo.discountType,
        applyTo: promo.applyTo,
        cwProductId: promo.cwProductId ?? null,
        adminOnly: true,
      },
    ];

    // Recompute totals from raw quote state. This mirrors quote.service's
    // recalcAndSaveQuote but uses the snapshot already present here.
    const onboarding = quote.onboarding as any;
    const totals = quote.totals as any;
    const selectedAddons = (quote.selectedAddons as any[]) ?? [];
    const pkg = quote.selectedPackage as any;
    const customer = quote.customer as any;
    const webUserCount = Number(customer?.webUserCount ?? 0);
    const baseOnboarding = onboarding?.totalCost ?? 0;
    const baseOneTime = selectedAddons
      .filter((a) => a.pricingType === 'one-time-only' || a.pricingType === 'both')
      .reduce((s, a) => s + (Number(a.setupPrice) || 0) * (Number(a.quantity) || 1), 0);
    const packageCost =
      (Number(pkg?.pricePerUser) || 0) * (Number(customer?.userCount) || 0) +
      (Number(pkg?.pricePerUserF3) || 0) * webUserCount +
      (Number(pkg?.pricePerLocation) || 0) * (Number(customer?.locationCount) || 0);
    const addonRecurring = selectedAddons
      .filter((a) => a.pricingType === 'recurring-only' || a.pricingType === 'both')
      .reduce((s, a) => s + (Number(a.recurringPrice) || 0) * (Number(a.quantity) || 1), 0);
    const baseRecurring = packageCost + addonRecurring;

    let onboardingDiscount = 0;
    let oneTimeDiscount = 0;
    let recurringDiscount = 0;
    for (const p of newPromos) {
      const pct = p.discountType === 'percentage';
      const amt = Number(p.discount) || 0;
      if (p.applyTo === 'onboarding') {
        onboardingDiscount += pct ? baseOnboarding * (amt / 100) : Math.min(amt, baseOnboarding - onboardingDiscount);
      } else if (p.applyTo === 'one-time') {
        oneTimeDiscount += pct ? baseOneTime * (amt / 100) : Math.min(amt, baseOneTime - oneTimeDiscount);
      } else if (p.applyTo === 'monthly') {
        recurringDiscount += pct ? baseRecurring * (amt / 100) : Math.min(amt, baseRecurring - recurringDiscount);
      }
    }
    const finalOnboarding = Math.max(0, baseOnboarding - onboardingDiscount);
    const finalOneTime = Math.max(0, baseOneTime - oneTimeDiscount);
    const finalRecurring = Math.max(0, baseRecurring - recurringDiscount);

    const updated = await prisma.quote.update({
      where: { id: quote.id },
      data: {
        appliedPromoCodes: newPromos as any,
        onboarding: { ...onboarding, discount: onboardingDiscount, finalCost: finalOnboarding } as any,
        totals: {
          ...totals,
          onboardingCost: finalOnboarding,
          oneTimeCosts: finalOneTime,
          recurringCosts: finalRecurring,
          discount: onboardingDiscount + oneTimeDiscount + recurringDiscount,
          grandTotal: finalOnboarding + finalOneTime + finalRecurring,
        } as any,
      },
    });
    res.json({ success: true, quote: updated });
  },
);

// Remove an admin-only (or any) promo from a quote.
router.delete(
  '/api/admin/quotes/:id/admin-promo',
  requireAuth,
  validate(z.object({ code: z.string().min(1) })),
  async (req, res) => {
    const id = req.params.id as string;
    const { code } = req.body as { code: string };
    const quote = await prisma.quote.findFirst({
      where: { OR: [{ id }, { quoteNumber: id }] },
    });
    if (!quote) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    const existing = (quote.appliedPromoCodes as any[]) ?? [];
    const remaining = existing.filter((p) => p.code?.toUpperCase() !== code.toUpperCase());
    if (remaining.length === existing.length) {
      res.status(404).json({ error: 'Promo not applied to this quote' });
      return;
    }
    // Same recompute as apply. Inline because we can't easily call
    // quote.service's private recalcAndSaveQuote from here.
    const onboarding = quote.onboarding as any;
    const totals = quote.totals as any;
    const selectedAddons = (quote.selectedAddons as any[]) ?? [];
    const pkg = quote.selectedPackage as any;
    const customer = quote.customer as any;
    const webUserCount = Number(customer?.webUserCount ?? 0);
    const baseOnboarding = onboarding?.totalCost ?? 0;
    const baseOneTime = selectedAddons
      .filter((a) => a.pricingType === 'one-time-only' || a.pricingType === 'both')
      .reduce((s, a) => s + (Number(a.setupPrice) || 0) * (Number(a.quantity) || 1), 0);
    const packageCost =
      (Number(pkg?.pricePerUser) || 0) * (Number(customer?.userCount) || 0) +
      (Number(pkg?.pricePerUserF3) || 0) * webUserCount +
      (Number(pkg?.pricePerLocation) || 0) * (Number(customer?.locationCount) || 0);
    const addonRecurring = selectedAddons
      .filter((a) => a.pricingType === 'recurring-only' || a.pricingType === 'both')
      .reduce((s, a) => s + (Number(a.recurringPrice) || 0) * (Number(a.quantity) || 1), 0);
    const baseRecurring = packageCost + addonRecurring;
    let onboardingDiscount = 0;
    let oneTimeDiscount = 0;
    let recurringDiscount = 0;
    for (const p of remaining) {
      const pct = p.discountType === 'percentage';
      const amt = Number(p.discount) || 0;
      if (p.applyTo === 'onboarding') {
        onboardingDiscount += pct ? baseOnboarding * (amt / 100) : Math.min(amt, baseOnboarding - onboardingDiscount);
      } else if (p.applyTo === 'one-time') {
        oneTimeDiscount += pct ? baseOneTime * (amt / 100) : Math.min(amt, baseOneTime - oneTimeDiscount);
      } else if (p.applyTo === 'monthly') {
        recurringDiscount += pct ? baseRecurring * (amt / 100) : Math.min(amt, baseRecurring - recurringDiscount);
      }
    }
    const finalOnboarding = Math.max(0, baseOnboarding - onboardingDiscount);
    const finalOneTime = Math.max(0, baseOneTime - oneTimeDiscount);
    const finalRecurring = Math.max(0, baseRecurring - recurringDiscount);
    const updated = await prisma.quote.update({
      where: { id: quote.id },
      data: {
        appliedPromoCodes: remaining as any,
        onboarding: { ...onboarding, discount: onboardingDiscount, finalCost: finalOnboarding } as any,
        totals: {
          ...totals,
          onboardingCost: finalOnboarding,
          oneTimeCosts: finalOneTime,
          recurringCosts: finalRecurring,
          discount: onboardingDiscount + oneTimeDiscount + recurringDiscount,
          grandTotal: finalOnboarding + finalOneTime + finalRecurring,
        } as any,
      },
    });
    res.json({ success: true, quote: updated });
  },
);

// Recent provisioning failures across all quotes — drives the admin
// Provisioning Errors view. Reads from AuditLog rows written by
// logProvisioningStepFailure in notify.service.
router.get('/api/admin/provisioning-errors', requireAuth, async (req, res) => {
  const take = Math.min(200, Number(req.query.limit) || 50);
  const rows = await prisma.auditLog.findMany({
    where: { action: 'provisioning_step_failed' },
    orderBy: { createdAt: 'desc' },
    take,
  });
  res.json({
    errors: rows.map((r) => {
      const data = (r.data as any) ?? {};
      return {
        id: r.id,
        quoteNumber: r.entityId,
        businessName: data.businessName ?? null,
        customerEmail: data.customerEmail ?? null,
        step: data.step ?? '(unknown)',
        error: data.error ?? null,
        provisioningStatus: data.provisioningStatus ?? null,
        cwIds: {
          company: data.cwCompanyId ?? null,
          contact: data.cwContactId ?? null,
          agreement: data.cwAgreementId ?? null,
          project: data.cwProjectId ?? null,
          opportunity: data.cwOpportunityId ?? null,
        },
        createdAt: r.createdAt.toISOString(),
      };
    }),
  });
});

export default router;
