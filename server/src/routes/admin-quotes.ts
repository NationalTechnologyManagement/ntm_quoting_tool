import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
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
