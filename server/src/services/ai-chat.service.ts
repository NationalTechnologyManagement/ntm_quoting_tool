// OpenRouter chat client. Handles:
//   - building the system prompt (instructions + KB + page snapshot)
//   - declaring the UI-only tool surface (no DB writes from agent)
//   - streaming SSE turns to the caller
//   - falling back to the secondary model on 5xx / timeout / 429
//   - per-turn cost accounting against per-session and global daily caps
//
// CRITICAL SECURITY INVARIANTS:
//   1. The OpenRouter API key never leaves this file. Client → /api/ai-chat/* → us → OpenRouter.
//   2. Tool calls only describe UI intent. The route layer is responsible for
//      validating each call against the page-side allowlist before echoing it
//      back to the client. The model has NO ability to write to the DB.
//   3. We never trust the model's claim about prices/IDs/quotes — those come
//      from the rendered page snapshot the client sent, which was rendered
//      from server-trusted data.

import { cred } from './integration-credentials.service.js';
import { getAiConfig, parseAllowedTools, type ToolName } from './ai-config.service.js';
import { buildKbContext } from './ai-kb.service.js';
import { redact } from './ai-redaction.js';
import { prisma } from '../config/prisma.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// OpenRouter exposes per-model pricing in /v1/models, but we don't need a
// live lookup for budget enforcement — a conservative per-model rate is
// fine. These are USD per 1M tokens (prompt / completion). When unknown, we
// use the safe-high default so we err on the side of cutting users off
// before the real bill creeps over the cap.
//
// Source: openrouter.ai pricing pages, audited 2026-05.
const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'anthropic/claude-sonnet-4-5': { in: 3, out: 15 },
  'anthropic/claude-opus-4-7': { in: 15, out: 75 },
  'anthropic/claude-haiku-4-5': { in: 1, out: 5 },
  'openai/gpt-4o-mini': { in: 0.15, out: 0.6 },
  'openai/gpt-4o': { in: 2.5, out: 10 },
  'google/gemini-2.5-flash': { in: 0.3, out: 2.5 },
};

const DEFAULT_PRICING = { in: 5, out: 20 }; // safe-high default

export function estimateUsdCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

// ── Tool surface (UI-only — no DB access) ─────────────────────────────
// These are the JSON Schemas the model sees. The route layer maps tool
// names to allowedTools and refuses anything not in the allowlist.

interface ToolDef {
  type: 'function';
  function: {
    name: ToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const ALL_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'highlight_field',
      description:
        'Visually highlight a form field on the current page so the user notices it. No data is changed. Use when guiding the user to fill in a specific input.',
      parameters: {
        type: 'object',
        properties: {
          fieldId: { type: 'string', description: 'DOM id of the field to highlight (e.g. "email", "userCount").' },
          reason: { type: 'string', description: 'One-sentence reason for the user.' },
        },
        required: ['fieldId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prefill_field',
      description:
        'Pre-fill a form field with a value the user explicitly provided in chat. The user can still review and edit before submitting. NEVER invent values — only echo what the user said.',
      parameters: {
        type: 'object',
        properties: {
          fieldId: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['fieldId', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description:
        'Suggest navigating to the next or previous step of the wizard. The user must confirm — this does not auto-advance.',
      parameters: {
        type: 'object',
        properties: {
          direction: { enum: ['next', 'back'], type: 'string' },
        },
        required: ['direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_package',
      description: 'Recommend one of the packages currently visible on the page. Pass the package id from the page snapshot.',
      parameters: {
        type: 'object',
        properties: {
          packageId: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['packageId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_addon',
      description: 'Recommend an add-on visible on the page. Pass the addon id from the page snapshot.',
      parameters: {
        type: 'object',
        properties: {
          addonId: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['addonId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_followup',
      description:
        "Offer the customer a scheduled call with an NTM sales rep. Use this when the customer's question isn't answerable from the page snapshot or knowledge base, when they want a human to review their setup, or when they ask for something that goes beyond the standard packages/add-ons. Always include a friendly text reply alongside this call.",
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'One short sentence summarizing what the rep should follow up on.',
          },
        },
        required: ['reason'],
      },
    },
  },
];

function toolsForConfig(allowedToolsCsv: string): ToolDef[] {
  const allowed = new Set(parseAllowedTools(allowedToolsCsv));
  return ALL_TOOLS.filter((t) => allowed.has(t.function.name));
}

// ── System prompt assembly ───────────────────────────────────────────

export async function buildSystemPrompt(pageSnapshot: unknown): Promise<string> {
  const cfg = await getAiConfig();
  const kb = await buildKbContext();
  const snapshotJson = JSON.stringify(pageSnapshot ?? {}, null, 2);
  const parts = [
    cfg.systemPrompt.trim(),
    kb ? `\n\n---\n## Knowledge base (authoritative — use this, don't invent)\n${kb}` : '',
    `\n\n---\n## Current page (what the customer is looking at right now)\n\`\`\`json\n${snapshotJson}\n\`\`\`\nIf an answer isn't in the page snapshot or the knowledge base above, say you don't have that info.`,
  ];
  return parts.join('');
}

// ── Streaming completion ──────────────────────────────────────────────

export interface StreamMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

export interface StreamCallbacks {
  onText: (delta: string) => void;
  onToolCall: (call: { id: string; name: string; arguments: string }) => void;
  onDone: (info: {
    fullText: string;
    toolCalls: Array<{ id: string; name: string; arguments: string }>;
    tokensIn: number;
    tokensOut: number;
    model: string;
    fallback: boolean;
    finishReason: string;
  }) => void;
  onError: (err: Error) => void;
}

interface StreamArgs {
  messages: StreamMessage[];
  signal?: AbortSignal;
}

async function callOpenRouter(model: string, args: StreamArgs, cb: StreamCallbacks, fallback: boolean): Promise<void> {
  const key = cred('OPENROUTER_API_KEY');
  if (!key) throw new Error('OPENROUTER_API_KEY not configured');
  const cfg = await getAiConfig();
  const tools = toolsForConfig(cfg.allowedTools);

  const body = {
    model,
    messages: args.messages,
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
    stream: true,
    tools: tools.length ? tools : undefined,
    tool_choice: tools.length ? 'auto' : undefined,
    usage: { include: true }, // request token counts in the final SSE chunk
  };

  const controller = new AbortController();
  args.signal?.addEventListener('abort', () => controller.abort());
  const timeout = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://trustntm.com',
        'X-Title': 'NTM Quoting Tool',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`), {
      status: res.status,
    });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let finishReason = 'stop';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf('\n');

      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;

      try {
        const evt = JSON.parse(payload);
        const choice = evt.choices?.[0];
        if (choice?.delta?.content) {
          const delta = choice.delta.content as string;
          fullText += delta;
          cb.onText(delta);
        }
        if (choice?.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index ?? 0;
            toolCalls[idx] = toolCalls[idx] || { id: '', name: '', arguments: '' };
            if (tc.id) toolCalls[idx].id = tc.id;
            if (tc.function?.name) toolCalls[idx].name = tc.function.name;
            if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments;
          }
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (evt.usage) {
          tokensIn = evt.usage.prompt_tokens ?? tokensIn;
          tokensOut = evt.usage.completion_tokens ?? tokensOut;
        }
      } catch {
        /* skip malformed line */
      }
    }
  }

  for (const tc of toolCalls) {
    if (tc.name) cb.onToolCall(tc);
  }
  cb.onDone({ fullText, toolCalls, tokensIn, tokensOut, model, fallback, finishReason });
}

/** Try primary, fall back on 5xx/429/timeout/abort. The fallback model gets
 *  the same conversation; the caller sees both the response stream and a
 *  fallback flag in the final onDone payload. */
export async function streamChat(args: StreamArgs, cb: StreamCallbacks): Promise<void> {
  const cfg = await getAiConfig();
  try {
    await callOpenRouter(cfg.primaryModel, args, cb, false);
    return;
  } catch (err: any) {
    const status = err?.status as number | undefined;
    const aborted = err?.name === 'AbortError';
    const fallbackEligible = aborted || !status || status >= 500 || status === 429;
    if (!fallbackEligible) {
      cb.onError(err);
      return;
    }
    if (!cfg.fallbackModel || cfg.fallbackModel === cfg.primaryModel) {
      cb.onError(err);
      return;
    }
    try {
      await callOpenRouter(cfg.fallbackModel, args, cb, true);
    } catch (err2: any) {
      cb.onError(err2);
    }
  }
}

// ── Persistence helpers ──────────────────────────────────────────────

export async function persistUserMessage(sessionId: string, content: string): Promise<void> {
  await prisma.chatMessage.create({
    data: { sessionId, role: 'user', content: redact(content) },
  });
}

export async function persistAssistantTurn(input: {
  sessionId: string;
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  model: string;
  tokensIn: number;
  tokensOut: number;
  usdCost: number;
  fallback: boolean;
}): Promise<void> {
  await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        sessionId: input.sessionId,
        role: 'assistant',
        content: redact(input.content),
        toolCalls: input.toolCalls.length ? (input.toolCalls as unknown as object) : undefined,
        model: input.model,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        usdCost: input.usdCost,
        fallback: input.fallback,
      },
    }),
    prisma.chatSession.update({
      where: { id: input.sessionId },
      data: {
        usdSpent: { increment: input.usdCost },
        tokensIn: { increment: input.tokensIn },
        tokensOut: { increment: input.tokensOut },
        usingFallback: input.fallback,
      },
    }),
  ]);
}

export async function getMessageHistory(sessionId: string, limit = 50): Promise<StreamMessage[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  return rows.map((r) => ({
    role: r.role as StreamMessage['role'],
    content: r.content,
    tool_calls: (r.toolCalls as unknown as StreamMessage['tool_calls']) || undefined,
    tool_call_id: r.toolName || undefined,
    name: r.toolName || undefined,
  }));
}
