import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const promoSchema = z.object({
  code: z.string().min(1).transform((v) => v.toUpperCase()),
  discount: z.number().min(0),
  discountType: z.enum(['percentage', 'fixed']),
  applyTo: z.enum(['one-time', 'monthly', 'onboarding']),
  active: z.boolean().optional(),
  maxUses: z.number().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  adminOnly: z.boolean().optional(),
  cwProductId: z.number().int().nullable().optional(),
});

router.get('/api/promo-codes', requireAuth, async (_req, res) => {
  const codes = await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(codes);
});

router.post('/api/promo-codes', requireAuth, validate(promoSchema), async (req, res) => {
  const code = await prisma.promoCode.create({ data: req.body });
  res.status(201).json(code);
});

router.put('/api/promo-codes/:id', requireAuth, validate(promoSchema.partial()), async (req, res) => {
  const id = req.params.id as string;
  const code = await prisma.promoCode.update({
    where: { id },
    data: req.body,
  });
  res.json(code);
});

router.delete('/api/promo-codes/:id', requireAuth, async (req, res) => {
  const id = req.params.id as string;
  await prisma.promoCode.update({
    where: { id },
    data: { active: false },
  });
  res.json({ success: true });
});

// Public: validate a promo code
router.post('/api/promo-codes/validate', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    res.status(400).json({ error: 'Code is required' });
    return;
  }

  const promo = await prisma.promoCode.findUnique({
    where: { code: code.toUpperCase() },
  });

  if (!promo || !promo.active) {
    res.status(404).json({ error: 'Invalid promo code' });
    return;
  }

  // Admin-only promos look "invalid" to public callers — same 404 as a
  // missing code so customers can't probe for hidden discounts.
  if ((promo as any).adminOnly) {
    res.status(404).json({ error: 'Invalid promo code' });
    return;
  }

  if (promo.expiresAt && promo.expiresAt < new Date()) {
    res.status(410).json({ error: 'Promo code expired' });
    return;
  }

  if (promo.maxUses && promo.currentUses >= promo.maxUses) {
    res.status(410).json({ error: 'Promo code usage limit reached' });
    return;
  }

  res.json({
    id: promo.id,
    code: promo.code,
    discount: promo.discount,
    discountType: promo.discountType,
    applyTo: promo.applyTo,
    active: promo.active,
  });
});

export default router;
