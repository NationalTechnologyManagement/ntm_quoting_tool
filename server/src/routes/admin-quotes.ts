import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { replayProvisioning } from '../services/connectwise.service.js';
import { getAllSteps } from '../services/cw-state.service.js';

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
    include: { contracts: true, provisioningSteps: { orderBy: { updatedAt: 'asc' } } },
  });

  if (!quote) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }

  res.json(quote);
});

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

export default router;
