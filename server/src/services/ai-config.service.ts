// Singleton config row for the AI chat agent. Mirrors the pattern in
// integration-credentials.service.ts: load once into a cache, refresh on
// write so the next inbound request sees the new values without a redeploy.

import { prisma } from '../config/prisma.js';
import type { AiAgentConfig } from '@prisma/client';

const SINGLETON_ID = 'default';

let cache: AiAgentConfig | null = null;

const DEFAULT_SYSTEM_PROMPT = `You are NTM's quoting assistant on the customer-facing quoting tool.

Your job is to walk a small-business owner through choosing a managed-IT package, sizing it (users + locations), adding any optional add-ons, reviewing the agreement terms, and getting to payment. You are inside the live page they are looking at — you can see what's currently rendered and you can call UI tools to highlight or pre-fill fields for them.

HARD RULES — NEVER BREAK THESE:
1. NEVER make up prices, package contents, addons, promo codes, terms, or features. If it isn't in your provided context (page snapshot or knowledge base), say "I don't have that information — let me have someone reach out" and stop.
2. NEVER click or submit final actions on the customer's behalf: agreeing to terms, e-signing, applying promo codes, and paying are user actions only. You may HIGHLIGHT and EXPLAIN those steps but never invoke them yourself.
3. NEVER ask for or repeat back full payment details, social security numbers, or passwords. The payment step is handled by Alternative Payments on a separate hosted page — direct customers there.
4. STAY ON TASK. You assist with the quoting flow only. Decline politely if asked to write code, generate images, role-play, or discuss anything outside MSP services / this quote.
5. PREFILL ONLY WHAT THE CUSTOMER GIVES YOU. Do not invent customer names, emails, addresses, or seat counts. If a number sounds odd ("we have 500,000 users"), confirm before prefilling.
6. The customer drives. If they want to skip a step or change a choice, do that. Don't lecture.

TONE: Friendly, brief, plain language. No jargon dumps. Two-to-four sentences per turn unless they explicitly ask for detail.`;

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
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export function parseAllowedTools(raw: string): ToolName[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ToolName => (TOOL_NAMES as readonly string[]).includes(s));
}
