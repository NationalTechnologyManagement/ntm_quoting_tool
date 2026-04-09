import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const addonSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  price: z.number().min(0),
  frequency: z.enum(['monthly', 'annually', 'one-time']),
  active: z.boolean().optional(),
  recurringPrice: z.number().nullable().optional(),
  recurringFrequency: z.enum(['monthly', 'annually']).nullable().optional(),
  setupPrice: z.number().nullable().optional(),
  pricingType: z.enum(['recurring-only', 'one-time-only', 'both']),
  sortOrder: z.number().optional(),
});

router.get('/api/addons', requireAuth, async (_req, res) => {
  const addons = await prisma.addon.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json(addons);
});

router.post('/api/addons', requireAuth, validate(addonSchema), async (req, res) => {
  const addon = await prisma.addon.create({ data: req.body });
  res.status(201).json(addon);
});

router.put('/api/addons/:id', requireAuth, validate(addonSchema.partial()), async (req, res) => {
  const id = req.params.id as string;
  const addon = await prisma.addon.update({
    where: { id },
    data: req.body,
  });
  res.json(addon);
});

router.delete('/api/addons/:id', requireAuth, async (req, res) => {
  const id = req.params.id as string;
  await prisma.addon.update({
    where: { id },
    data: { active: false },
  });
  res.json({ success: true });
});

export default router;
