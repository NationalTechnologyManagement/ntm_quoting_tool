import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const siteContentSchema = z.object({
  quoteBuilderHeading: z.string().min(1).max(200).optional(),
  quoteBuilderSubheading: z.string().min(1).max(2000).optional(),
  quoteBuilderExplainerTitle: z.string().min(1).max(200).optional(),
  quoteBuilderExplainerBody: z.string().min(1).max(5000).optional(),
});

router.get('/api/admin/site-content', requireAuth, async (_req, res) => {
  const row = await prisma.siteContent.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });
  res.json(row);
});

router.put(
  '/api/admin/site-content',
  requireAuth,
  validate(siteContentSchema),
  async (req, res) => {
    const patch = req.body as z.infer<typeof siteContentSchema>;
    const updated = await prisma.siteContent.upsert({
      where: { id: 'default' },
      update: patch,
      create: { id: 'default', ...patch },
    });
    res.json(updated);
  },
);

export default router;
