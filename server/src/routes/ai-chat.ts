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
  persistToolResults,
  getMessageHistory,
  toWireToolCalls,
  type StreamMessage,
  type TurnInfo,
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

    // ── Agentic tool loop ────────────────────────────────────────────
    // When the model emits tool calls it STOPS generating (finish_reason
    // "tool_calls") and waits for role:"tool" result messages. The tools
    // execute client-side (we echo them over SSE and the page applies
    // them), so we answer each call with a synthetic success result and
    // call the model again — that follow-up round is what produces the
    // "done — here's what happened, what's next?" text. Loop until a
    // round comes back as plain text, with a cap so a tool-happy model
    // can't spin forever.
    const MAX_TOOL_ROUNDS = 4;
    const convo: StreamMessage[] = [...messages];
    let totalUsd = 0;
    let lastInfo: TurnInfo | null = null;

    const runRound = () =>
      new Promise<TurnInfo | null>((resolve) => {
        streamChat(
          { messages: convo, signal: onClientAbort.signal },
          {
            onText: (delta) => {
              if (finished) return;
              send('token', { text: delta });
            },
            onToolCall: (call) => {
              if (finished) return;
              send('tool', { id: call.id, name: call.name, arguments: call.arguments });
            },
            onDone: resolve,
            onError: (err) => {
              if (!finished) send('error', { message: redact(err?.message || 'AI request failed') });
              resolve(null);
            },
          },
        ).catch((err: any) => {
          if (!finished) send('error', { message: redact(err?.message || 'AI request failed') });
          resolve(null);
        });
      });

    for (let round = 0; ; round++) {
      const info = await runRound();
      if (!info) break; // error already sent to client

      const usdCost = estimateUsdCost(info.model, info.tokensIn, info.tokensOut);
      totalUsd += usdCost;
      lastInfo = info;
      // Persist outside streamChat so a DB failure can't crash the worker.
      // Worst case we reply but don't log.
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
      } catch (err) {
        console.error('[ai-chat] persist failed', err);
      }

      if (!info.toolCalls.length) break; // plain-text turn — conversation point reached

      // Answer every tool call so the model can keep talking.
      const results = info.toolCalls.map((tc) => {
        // The contact form is async — the customer fills it out on their own
        // time. Tell the model to wait instead of barrelling into the next
        // question; the submitted details arrive in a later snapshot.
        if (
          tc.name === 'collect_contact' ||
          tc.name === 'collect_sizing' ||
          tc.name === 'collect_recipients'
        ) {
          const which =
            tc.name === 'collect_contact'
              ? 'contact'
              : tc.name === 'collect_sizing'
                ? 'sizing'
                : 'recipient';
          return {
            toolCallId: tc.id,
            content:
              `ok — the ${which} form is now showing in the chat. Tell the customer to fill it out (one short line), then STOP. Do NOT ask the next question or call any other tool yet; wait for them to submit it.`,
          };
        }
        // send_quote emails the quote client-side (async). Tell the model to
        // confirm and ask about extra recipients — but not to assume anything
        // beyond "it's being sent" since we have no client→server result.
        if (tc.name === 'send_quote') {
          return {
            toolCallId: tc.id,
            content:
              "ok — the quote is being emailed to the customer now. In one short line, tell them it's on the way, then ASK if they'd like it sent to anyone else. Do NOT call another tool until they answer.",
          };
        }
        // go_to_checkout can be refused client-side (no package / no sizing
        // yet), and we have no client→server result channel, so don't assert
        // success. Tell the model to verify via the next snapshot's route
        // before promising the customer they're on the pay page.
        if (tc.name === 'go_to_checkout') {
          return {
            toolCallId: tc.id,
            content:
              "ok — go_to_checkout was requested. If a package and sizing were already set, the customer is now on the summary page to sign and pay; confirm that in one short line. If either was missing it did NOT move them — in that case gather what's missing instead. The next customer message carries a fresh snapshot with the real route, so don't over-promise.",
          };
        }
        const stale =
          tc.name === 'navigate' || tc.name === 'suggest_package'
            ? ' The page changed, so the page snapshot in your context is now stale — rely on the conversation; the next customer message carries a fresh snapshot.'
            : '';
        return {
          toolCallId: tc.id,
          content: `ok — ${tc.name} was applied on the customer's page.${stale} Briefly confirm to the customer what just happened, then ask the next question.`,
        };
      });
      convo.push(
        { role: 'assistant', content: info.fullText, tool_calls: toWireToolCalls(info.toolCalls) },
        ...results.map<StreamMessage>((r) => ({ role: 'tool', content: r.content, tool_call_id: r.toolCallId })),
      );
      try {
        await persistToolResults(session.id, results);
      } catch (err) {
        console.error('[ai-chat] tool-result persist failed', err);
      }

      // The in-chat forms are async waits — the customer fills them on their
      // own time. Stop the loop here regardless of what the model might do
      // next; their submission starts a fresh turn. This hard-enforces the
      // "wait" so the model can't barrel into the next question.
      if (
        info.toolCalls.some(
          (tc) =>
            tc.name === 'collect_contact' ||
            tc.name === 'collect_sizing' ||
            tc.name === 'collect_recipients',
        )
      )
        break;

      if (round >= MAX_TOOL_ROUNDS) break; // model is stuck calling tools — stop here
      // Separator so this round's text doesn't mash into the follow-up text
      // in the client's single assistant bubble.
      if (info.fullText && !finished) send('token', { text: '\n\n' });
    }

    try {
      await touchSession(session.id);
    } catch (err) {
      console.error('[ai-chat] touch failed', err);
    }
    if (lastInfo && !finished) {
      send('done', {
        model: lastInfo.model,
        fallback: lastInfo.fallback,
        usdCost: totalUsd,
        finishReason: lastInfo.finishReason,
      });
    }
    finish();
  },
);

export default router;
