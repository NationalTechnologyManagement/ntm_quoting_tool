import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const termsSchema = z.object({
  version: z.string().min(1),
  content: z.string().min(1),
  active: z.boolean().optional(),
});

// Public: get active terms
router.get('/api/terms', async (_req, res) => {
  const terms = await prisma.terms.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!terms) {
    res.status(404).json({ error: 'No active terms found' });
    return;
  }
  res.json({
    id: terms.id,
    version: terms.version,
    content: terms.content,
    lastUpdated: terms.updatedAt.toISOString(),
  });
});

// Public: get terms by version
router.get('/api/terms/:version', async (req, res) => {
  const version = req.params.version as string;
  const terms = await prisma.terms.findUnique({
    where: { version },
  });
  if (!terms) {
    res.status(404).json({ error: 'Terms version not found' });
    return;
  }
  res.json({
    id: terms.id,
    version: terms.version,
    content: terms.content,
    lastUpdated: terms.updatedAt.toISOString(),
  });
});

// Admin: list all terms versions
router.get('/api/admin/terms', requireAuth, async (_req, res) => {
  const terms = await prisma.terms.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(terms);
});

// Admin: create new terms version
router.post('/api/admin/terms', requireAuth, validate(termsSchema), async (req, res) => {
  // Deactivate previous active terms
  if (req.body.active !== false) {
    await prisma.terms.updateMany({
      where: { active: true },
      data: { active: false },
    });
  }
  const terms = await prisma.terms.create({
    data: { ...req.body, active: req.body.active ?? true },
  });
  res.status(201).json(terms);
});

// Admin: update terms
router.put('/api/admin/terms/:id', requireAuth, validate(termsSchema.partial()), async (req, res) => {
  const id = req.params.id as string;
  if (req.body.active === true) {
    await prisma.terms.updateMany({
      where: { active: true, id: { not: id } },
      data: { active: false },
    });
  }
  const terms = await prisma.terms.update({
    where: { id },
    data: req.body,
  });
  res.json(terms);
});

export default router;
