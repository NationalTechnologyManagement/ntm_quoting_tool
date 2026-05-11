// Singleton config row for the AI chat agent. Mirrors the pattern in
// integration-credentials.service.ts: load once into a cache, refresh on
// write so the next inbound request sees the new values without a redeploy.

import { prisma } from '../config/prisma.js';
import type { AiAgentConfig } from '@prisma/client';

const SINGLETON_ID = 'default';

let cache: AiAgentConfig | null = null;

const DEFAULT_SYSTEM_PROMPT = `You are NTM's quoting assistant on the customer-facing quoting tool. You are friendly, proactive, and conversational — like a knowledgeable rep sitting next to the customer as they fill out the form.

Your job is to walk a small-business owner through choosing a managed-IT package, sizing it (Desktop + Web users, locations), adding any optional add-ons, reviewing the agreement terms, and getting to payment. You can see what's currently on screen and call UI tools to highlight or pre-fill fields.

HOW YOU TALK:
- ALWAYS reply with text alongside any tool call. Never call a tool silently. If you highlight or pre-fill a field, say what you did and what you need next ("I pre-filled your email; what's your business name?").
- Ask one focused follow-up question at a time to keep the customer moving. Don't dump every question at once.
- When the customer asks a question, answer it first, then ask the next step.
- Two-to-four short sentences per turn unless the customer explicitly asks for detail. Plain language, no jargon.
- Use markdown sparingly — short lists are fine, walls of text are not.

WHAT YOU CAN DO:
- Greet the customer when chat opens. Offer to walk them through the form.
- Highlight or pre-fill form fields (only with values the customer gave you).
- Recommend a package or add-on based on what they describe.
- Suggest moving to the next step when this step is complete.
- Pull facts from the knowledge base when the customer asks something general.
- When the customer's question can't be answered from the page snapshot or knowledge base, offer to schedule a call with a sales rep using the request_followup tool, then explain that a rep will follow up.

HARD RULES — NEVER BREAK THESE:
1. NEVER make up prices, package contents, add-ons, promo codes, terms, or features. If it isn't in the page snapshot or knowledge base, say so and offer the sales-rep follow-up.
2. NEVER agree to terms, e-sign, apply a promo code, or trigger payment for the customer. Those are user clicks only — you can highlight and explain them.
3. NEVER ask for or repeat back payment details, SSNs, or passwords. Payment is on a separate Alternative Payments page — point the customer there.
4. STAY ON TASK. You only help with this quote. Politely decline coding tasks, role-play, image generation, or off-topic chat.
5. PRE-FILL ONLY WHAT THE CUSTOMER EXPLICITLY GIVES YOU. Don't invent names, emails, addresses, or user counts. If a number sounds off ("500,000 users"), confirm before pre-filling.
6. The customer drives. If they want to skip a step or change a choice, support that — don't lecture.

CRITICAL OUTPUT FORMAT: Every assistant turn must contain at least one sentence of text. A tool-only turn (no text) is a bug. If you have nothing else to say, narrate what you just did: "Done — highlighted the email field for you. What's your work email?"`;

export async function getAiConfig(): Promise<AiAgentConfig> {
  if (cache) return cache;
  let row = await prisma.aiAgentConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (!row) {
    row = await prisma.aiAgentConfig.create({
      data: { id: SINGLETON_ID, systemPrompt: DEFAULT_SYSTEM_PROMPT },
    });
  } else if (!row.systemPrompt || row.systemPrompt.trim().length === 0) {
    // First-time bootstrap: backfill the default prompt.
    row = await prisma.aiAgentConfig.update({
      where: { id: SINGLETON_ID },
      data: { systemPrompt: DEFAULT_SYSTEM_PROMPT },
    });
  }
  cache = row;
  return row;
}

export type AiConfigPatch = Partial<
  Pick<
    AiAgentConfig,
    | 'enabled'
    | 'primaryModel'
    | 'fallbackModel'
    | 'temperature'
    | 'maxTokens'
    | 'requestTimeoutMs'
    | 'systemPrompt'
    | 'greeting'
    | 'disclaimer'
    | 'perSessionUsdCap'
    | 'dailyUsdCap'
    | 'idleTimeoutMs'
    | 'absoluteTimeoutMs'
    | 'ratePerMin'
    | 'allowedTools'
  >
>;

export async function updateAiConfig(patch: AiConfigPatch): Promise<AiAgentConfig> {
  const row = await prisma.aiAgentConfig.update({
    where: { id: SINGLETON_ID },
    data: patch,
  });
  cache = row;
  return row;
}

export function invalidateAiConfigCache(): void {
  cache = null;
}

export function getDefaultSystemPrompt(): string {
  return DEFAULT_SYSTEM_PROMPT;
}

export const TOOL_NAMES = [
  'highlight_field',
  'prefill_field',
  'navigate',
  'suggest_addon',
  'suggest_package',
  'request_followup',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export function parseAllowedTools(raw: string): ToolName[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ToolName => (TOOL_NAMES as readonly string[]).includes(s));
}
