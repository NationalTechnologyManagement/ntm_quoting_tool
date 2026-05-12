import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';

const router = Router();

const packageSchema = z.object({
  name: z.string().min(1),
  pricePerUser: z.number().min(0),
  pricePerUserF3: z.number().min(0).optional(),
  pricePerLocation: z.number().min(0),
  frequency: z.enum(['monthly', 'annually', 'one-time']),
  features: z.array(z.string()),
  featureGroups: z
    .array(
      z.object({
        category: z.string().min(1).max(60),
        items: z.array(z.string().min(1).max(300)),
      }),
    )
    .optional(),
  isBestValue: z.boolean().optional(),
  customerVisible: z.boolean().optional(),
  sortOrder: z.number().optional(),
  cwAgreementTypeId: z.number().int().nullable().optional(),
  cwPerUserProductId: z.number().int().nullable().optional(),
  cwPerUserF3ProductId: z.number().int().nullable().optional(),
  cwPerLocationProductId: z.number().int().nullable().optional(),
  // 0 = month-to-month, 36 = 3-year, 60 = 5-year. Any non-negative int is
  // accepted so ops can plug in odd terms (e.g. 12-month pilot) without a
  // schema change, but the admin UI only surfaces the three standard buckets.
  agreementMonths: z.number().int().min(0).optional(),
});

// List all packages (including inactive)
router.get('/api/packages', requireAuth, async (_req, res) => {
  const packages = await prisma.package.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json(packages);
});

// Create
router.post('/api/packages', requireAuth, validate(packageSchema), async (req, res) => {
  const pkg = await prisma.package.create({ data: req.body });
  res.status(201).json(pkg);
});

// Update
router.put('/api/packages/:id', requireAuth, validate(packageSchema.partial()), async (req, res) => {
  const id = req.params.id as string;
  const pkg = await prisma.package.update({
    where: { id },
    data: req.body,
  });
  res.json(pkg);
});

// Delete (soft)
router.delete('/api/packages/:id', requireAuth, async (req, res) => {
  const id = req.params.id as string;
  await prisma.package.update({
    where: { id },
    data: { active: false },
  });
  res.json({ success: true });
});

export default router;
