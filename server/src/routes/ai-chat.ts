// Public AI-chat endpoints. No JWT required — auth is the signed session
// cookie issued at /api/ai-chat/session and verified on every request.
//
// Endpoints
//   POST /api/ai-chat/session   → start (or restart) a session, set cookie
//   GET  /api/ai-chat/session   → introspect current session (used by client on mount)
//   GET  /api/ai-chat/messages  → load history for the current cookie
//   POST /api/ai-chat/message   → send user message, stream response (SSE)
//   POST /api/ai-chat/end       → end session and clear cookie
//
// The chat itself is gated by the `enabled` flag on AiAgentConfig: when an
// admin flips the kill switch, /session immediately starts returning 503.

import { Router, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import {
  startSession,
  loadSession,
  touchSession,
  endSession,
  checkRateLimit,
  checkIpLimit,
  getDailyUsdSpent,
} from '../services/ai-session.service.js';
import { getAiConfig } from '../services/ai-config.service.js';
import { cred } from '../services/integration-credentials.service.js';
import {
  buildSystemPrompt,
  streamChat,
  estimateUsdCost,
  persistUserMessage,
  persistAssistantTurn,
  getMessageHistory,
  type StreamMessage,
} from '../services/ai-chat.service.js';
import { redact } from '../services/ai-redaction.js';
import { prisma } from '../config/prisma.js';

const router = Router();

function isEnabled(): Promise<boolean> {
  return getAiConfig().then((c) => c.enabled && !!cred('OPENROUTER_API_KEY'));
}

// ── Session lifecycle ────────────────────────────────────────────────

const startSchema = z.object({
  quoteId: z.string().nullish(),
});

router.post(
  '/api/ai-chat/session',
  validate(startSchema),
  async (req, res) => {
    if (!(await isEnabled())) {
      res.status(503).json({ error: 'AI assistant is not enabled' });
      return;
    }
    if (!checkIpLimit(req.ip)) {
      res.status(429).json({ error: 'Too many sessions from this IP. Try again in a minute.' });
      return;
    }
    const session = await startSession(req, res, { quoteId: req.body?.quoteId ?? null });
    const cfg = await getAiConfig();
    res.json({
      sessionId: session.id,
      greeting: cfg.greeting,
      disclaimer: cfg.disclaimer,
      perSessionUsdCap: cfg.perSessionUsdCap,
      idleTimeoutMs: cfg.idleTimeoutMs,
      absoluteTimeoutMs: cfg.absoluteTimeoutMs,
    });
  },
);

router.get('/api/ai-chat/session', async (req, res) => {
  if (!(await isEnabled())) {
    res.status(503).json({ error: 'AI assistant is not enabled' });
    return;
  }
  const result = await loadSession(req);
  if (!result.ok) {
    res.status(result.status ?? 401).json({ error: result.reason });
    return;
  }
  const cfg = await getAiConfig();
  res.json({
    sessionId: result.session.id,
    usdSpent: result.session.usdSpent,
    perSessionUsdCap: cfg.perSessionUsdCap,
    usingFallback: result.session.usingFallback,
    greeting: cfg.greeting,
    disclaimer: cfg.disclaimer,
  });
});

router.post('/api/ai-chat/end', async (req, res) => {
  const result = await loadSession(req);
  if (result.ok) await endSession(result.session.id, res);
  res.json({ success: true });
});

router.get('/api/ai-chat/messages', async (req, res) => {
  const result = await loadSession(req);
  if (!result.ok) {
    res.status(result.status ?? 401).json({ error: result.reason });
    return;
  }
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId: result.session.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      toolCalls: true,
      fallback: true,
      createdAt: true,
    },
  });
  res.json({ messages });
});

// ── Streaming message ────────────────────────────────────────────────

const messageSchema = z.object({
  message: z.string().min(1).max(4000),
  // Page snapshot is the agent's eyes — what's currently on screen.
  // Shape is loose by design; the model just inspects it. We cap size to
  // keep prompts reasonable.
  pageSnapshot: z.unknown().optional(),
});

router.post(
  '/api/ai-chat/message',
  validate(messageSchema),
  async (req, res) => {
    if (!(await isEnabled())) {
      res.status(503).json({ error: 'AI assistant is not enabled' });
      return;
    }
    const loaded = await loadSession(req);
    if (!loaded.ok) {
      res.status(loaded.status ?? 401).json({ error: loaded.reason });
      return;
    }
    const session = loaded.session;
    const cfg = await getAiConfig();

    // Per-session $ cap
    if (session.usdSpent >= cfg.perSessionUsdCap) {
      await prisma.chatSession
        .update({ where: { id: session.id }, data: { status: 'capped' } })
        .catch(() => {});
      res.status(402).json({ error: 'Per-session spend cap reached' });
      return;
    }
    // Global daily cap
    const todaySpend = await getDailyUsdSpent();
    if (todaySpend >= cfg.dailyUsdCap) {
      res.status(402).json({ error: 'Daily AI assistant budget reached. Try again tomorrow.' });
      return;
    }
    // Per-session message rate limit
    if (!checkRateLimit(session.id, cfg.ratePerMin)) {
      res.status(429).json({ error: 'Slow down a moment.' });
      return;
    }

    // Cap snapshot payload defensively (~100KB JSON)
    const snapshotJson = JSON.stringify(req.body?.pageSnapshot ?? {});
    if (snapshotJson.length > 100_000) {
      res.status(413).json({ error: 'Page snapshot too large.' });
      return;
    }
    const pageSnapshot = JSON.parse(snapshotJson);

    const userText: string = req.body.message;
    await persistUserMessage(session.id, userText);

    const systemPrompt = await buildSystemPrompt(pageSnapshot);
    const history = await getMessageHistory(session.id, 40);
    const messages: StreamMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.filter((m) => m.role !== 'system'),
    ];

    // SSE response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onClientAbort = new AbortController();
    req.on('close', () => onClientAbort.abort());

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { res.end(); } catch { /* already closed */ }
    };

    await new Promise<void>((resolve) => {
      streamChat(
        { messages, signal: onClientAbort.signal },
        {
          onText: (delta) => {
            if (finished) return;
            send('token', { text: delta });
          },
          onToolCall: (call) => {
            if (finished) return;
            send('tool', { id: call.id, name: call.name, arguments: call.arguments });
          },
          onDone: (info) => {
            // Persist + touch outside the streamChat call so a DB failure
            // can't crash the worker. Worst case we reply but don't log.
            (async () => {
              const usdCost = estimateUsdCost(info.model, info.tokensIn, info.tokensOut);
              try {
                await persistAssistantTurn({
                  sessionId: session.id,
                  content: info.fullText,
                  toolCalls: info.toolCalls,
                  model: info.model,
                  tokensIn: info.tokensIn,
                  tokensOut: info.tokensOut,
                  usdCost,
                  fallback: info.fallback,
                });
                await touchSession(session.id);
              } catch (err) {
                console.error('[ai-chat] persist failed', err);
              }
              if (!finished) {
                send('done', {
                  model: info.model,
                  fallback: info.fallback,
                  usdCost,
                  finishReason: info.finishReason,
                });
              }
              finish();
              resolve();
            })();
          },
          onError: (err) => {
            if (!finished) send('error', { message: redact(err?.message || 'AI request failed') });
            finish();
            resolve();
          },
        },
      ).catch((err: any) => {
        if (!finished) send('error', { message: redact(err?.message || 'AI request failed') });
        finish();
        resolve();
      });
    });
  },
);

export default router;
