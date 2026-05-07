// Cookie-based chat sessions for the public AI assistant.
//
// The chat cookie is `ntm_ai_sid=<sessionId>.<hmac>`. We verify the HMAC on
// every request, then load the ChatSession row and enforce idle + absolute
// timeouts. Cookies are HttpOnly, SameSite=Lax, and Secure in production so
// cross-origin JS can't read them and a stolen sid can't be replayed across
// HTTP. The HMAC adds a second line of defense: even if a client tries to
// guess a session id, they can't forge a valid cookie without the secret.

import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { cred } from './integration-credentials.service.js';
import { getAiConfig } from './ai-config.service.js';
import type { ChatSession } from '@prisma/client';

const COOKIE_NAME = 'ntm_ai_sid';

function signingKey(): string {
  return cred('AI_CHAT_COOKIE_SECRET') || env.AI_CHAT_COOKIE_SECRET || env.JWT_SECRET;
}

function sign(sessionId: string): string {
  return createHmac('sha256', signingKey()).update(sessionId).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function parseCookie(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE_NAME) return rest.join('=');
  }
  return null;
}

function setCookie(res: Response, sessionId: string): void {
  const value = `${sessionId}.${sign(sessionId)}`;
  const flags = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (env.NODE_ENV === 'production') flags.push('Secure');
  // We deliberately don't set Max-Age — this is a session cookie that dies
  // with the tab. Server-side timeout enforces absolute lifetime regardless.
  res.setHeader('Set-Cookie', flags.join('; '));
}

export function clearCookie(res: Response): void {
  const flags = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (env.NODE_ENV === 'production') flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

export interface SessionLoadResult {
  ok: true;
  session: ChatSession;
}
export interface SessionLoadError {
  ok: false;
  reason: 'missing' | 'tampered' | 'unknown' | 'idle' | 'absolute' | 'capped' | 'ended';
  status?: number;
}

/** Validate cookie, load row, enforce timeouts. Returns the session or a
 *  reason why it isn't usable. Does not write/extend — call touch() to do that. */
export async function loadSession(req: Request): Promise<SessionLoadResult | SessionLoadError> {
  const cookie = parseCookie(req);
  if (!cookie) return { ok: false, reason: 'missing', status: 401 };

  const dotIdx = cookie.lastIndexOf('.');
  if (dotIdx < 0) return { ok: false, reason: 'tampered', status: 401 };
  const sessionId = cookie.slice(0, dotIdx);
  const sig = cookie.slice(dotIdx + 1);
  if (!safeEqual(sig, sign(sessionId))) return { ok: false, reason: 'tampered', status: 401 };

  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) return { ok: false, reason: 'unknown', status: 401 };
  if (session.status === 'ended') return { ok: false, reason: 'ended', status: 410 };
  if (session.status === 'capped') return { ok: false, reason: 'capped', status: 402 };

  const cfg = await getAiConfig();
  const now = Date.now();
  const idleAge = now - session.lastActivityAt.getTime();
  const absoluteAge = now - session.createdAt.getTime();

  if (idleAge > cfg.idleTimeoutMs) {
    await prisma.chatSession
      .update({ where: { id: session.id }, data: { status: 'expired', endedAt: new Date() } })
      .catch(() => {});
    return { ok: false, reason: 'idle', status: 440 };
  }
  if (absoluteAge > cfg.absoluteTimeoutMs) {
    await prisma.chatSession
      .update({ where: { id: session.id }, data: { status: 'expired', endedAt: new Date() } })
      .catch(() => {});
    return { ok: false, reason: 'absolute', status: 440 };
  }

  return { ok: true, session };
}

/** Bump lastActivityAt. Called after a successful turn. */
export async function touchSession(sessionId: string): Promise<void> {
  await prisma.chatSession
    .update({ where: { id: sessionId }, data: { lastActivityAt: new Date() } })
    .catch(() => {});
}

/** Create a fresh session and set the cookie. */
export async function startSession(
  req: Request,
  res: Response,
  opts?: { quoteId?: string | null },
): Promise<ChatSession> {
  const session = await prisma.chatSession.create({
    data: {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
      quoteId: opts?.quoteId ?? null,
    },
  });
  setCookie(res, session.id);
  return session;
}

export async function endSession(sessionId: string, res: Response): Promise<void> {
  await prisma.chatSession
    .update({
      where: { id: sessionId },
      data: { status: 'ended', endedAt: new Date() },
    })
    .catch(() => {});
  clearCookie(res);
}

/** Per-session sliding-window message rate limit, in-memory (single-process). */
const rateBuckets = new Map<string, number[]>();
export function checkRateLimit(sessionId: string, perMin: number): boolean {
  const now = Date.now();
  const cutoff = now - 60_000;
  const arr = rateBuckets.get(sessionId) || [];
  const fresh = arr.filter((t) => t > cutoff);
  if (fresh.length >= perMin) {
    rateBuckets.set(sessionId, fresh);
    return false;
  }
  fresh.push(now);
  rateBuckets.set(sessionId, fresh);
  return true;
}

/** Per-IP sliding-window for /session creation, to stop spam session minting. */
const ipBuckets = new Map<string, number[]>();
const IP_LIMIT_PER_MIN = 10;
export function checkIpLimit(ip: string | undefined): boolean {
  if (!ip) return true;
  const now = Date.now();
  const cutoff = now - 60_000;
  const arr = ipBuckets.get(ip) || [];
  const fresh = arr.filter((t) => t > cutoff);
  if (fresh.length >= IP_LIMIT_PER_MIN) {
    ipBuckets.set(ip, fresh);
    return false;
  }
  fresh.push(now);
  ipBuckets.set(ip, fresh);
  return true;
}

/** Aggregate today's spend across all sessions. */
export async function getDailyUsdSpent(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const result = await prisma.chatMessage.aggregate({
    where: { createdAt: { gte: startOfDay } },
    _sum: { usdCost: true },
  });
  return result._sum.usdCost ?? 0;
}
