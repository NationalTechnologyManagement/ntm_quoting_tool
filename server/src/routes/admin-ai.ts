import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { prisma } from '../config/prisma.js';
import {
  getAiConfig,
  updateAiConfig,
  getDefaultSystemPrompt,
  TOOL_NAMES,
} from '../services/ai-config.service.js';
import {
  listKbDocs,
  createKbDoc,
  updateKbDoc,
  deleteKbDoc,
} from '../services/ai-kb.service.js';
import { cred } from '../services/integration-credentials.service.js';

const router = Router();

// ── Config ──────────────────────────────────────────────────────────

router.get('/api/admin/ai-chat/config', requireAuth, async (_req, res) => {
  const cfg = await getAiConfig();
  res.json({
    config: cfg,
    defaults: { systemPrompt: getDefaultSystemPrompt() },
    availableTools: TOOL_NAMES,
    apiKeyConfigured: !!cred('OPENROUTER_API_KEY'),
  });
});

const configPatchSchema = z.object({
  enabled: z.boolean().optional(),
  primaryModel: z.string().min(1).max(200).optional(),
  fallbackModel: z.string().min(1).max(200).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(64).max(8192).optional(),
  requestTimeoutMs: z.number().int().min(5_000).max(120_000).optional(),
  systemPrompt: z.string().max(20_000).optional(),
  greeting: z.string().max(500).optional(),
  disclaimer: z.string().max(500).optional(),
  perSessionUsdCap: z.number().min(0).max(1000).optional(),
  dailyUsdCap: z.number().min(0).max(10_000).optional(),
  idleTimeoutMs: z.number().int().min(60_000).max(86_400_000).optional(),
  absoluteTimeoutMs: z.number().int().min(60_000).max(86_400_000).optional(),
  ratePerMin: z.number().int().min(1).max(120).optional(),
  allowedTools: z.string().max(500).optional(),
});

router.put(
  '/api/admin/ai-chat/config',
  requireAuth,
  validate(configPatchSchema),
  async (req, res) => {
    const patch = req.body as z.infer<typeof configPatchSchema>;
    const updated = await updateAiConfig(patch);
    res.json({ config: updated });
  },
);

// ── Knowledge base ──────────────────────────────────────────────────

router.get('/api/admin/ai-chat/kb', requireAuth, async (_req, res) => {
  const docs = await listKbDocs();
  res.json({ docs });
});

const kbCreateSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50_000),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.post(
  '/api/admin/ai-chat/kb',
  requireAuth,
  validate(kbCreateSchema),
  async (req, res) => {
    const doc = await createKbDoc(req.body);
    res.json({ doc });
  },
);

const kbUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(50_000).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.put(
  '/api/admin/ai-chat/kb/:id',
  requireAuth,
  validate(kbUpdateSchema),
  async (req, res) => {
    const doc = await updateKbDoc(req.params.id, req.body);
    res.json({ doc });
  },
);

router.delete('/api/admin/ai-chat/kb/:id', requireAuth, async (req, res) => {
  await deleteKbDoc(req.params.id);
  res.json({ success: true });
});

// ── Usage / sessions ────────────────────────────────────────────────

router.get('/api/admin/ai-chat/usage', requireAuth, async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOf30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [today, last30, totalSessions, recentSessions] = await Promise.all([
    prisma.chatMessage.aggregate({
      where: { createdAt: { gte: startOfDay } },
      _sum: { usdCost: true, tokensIn: true, tokensOut: true },
      _count: true,
    }),
    prisma.chatMessage.aggregate({
      where: { createdAt: { gte: startOf30 } },
      _sum: { usdCost: true, tokensIn: true, tokensOut: true },
      _count: true,
    }),
    prisma.chatSession.count(),
    prisma.chatSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        status: true,
        usdSpent: true,
        tokensIn: true,
        tokensOut: true,
        usingFallback: true,
        ipAddress: true,
        quoteId: true,
        createdAt: true,
        endedAt: true,
        lastActivityAt: true,
        _count: { select: { messages: true } },
      },
    }),
  ]);

  res.json({
    today: {
      usdCost: today._sum.usdCost ?? 0,
      tokensIn: today._sum.tokensIn ?? 0,
      tokensOut: today._sum.tokensOut ?? 0,
      messages: today._count,
    },
    last30: {
      usdCost: last30._sum.usdCost ?? 0,
      tokensIn: last30._sum.tokensIn ?? 0,
      tokensOut: last30._sum.tokensOut ?? 0,
      messages: last30._count,
    },
    totalSessions,
    recentSessions,
  });
});

router.get('/api/admin/ai-chat/sessions/:id', requireAuth, async (req, res) => {
  const session = await prisma.chatSession.findUnique({
    where: { id: req.params.id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          model: true,
          tokensIn: true,
          tokensOut: true,
          usdCost: true,
          fallback: true,
          toolCalls: true,
          createdAt: true,
        },
      },
    },
  });
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ session });
});

export default router;
