// GHL-embed SSO: per-device passwordless re-entry.
//
// The flow is: GHL Custom Menu Link points at /sso/ghl?loc=...&k=...
//   1. Frontend loads the SPA route /sso/ghl and POSTs to /api/sso/ghl/check
//      with { loc, k } and the device cookie (if any).
//   2. If the device cookie verifies → return a fresh scoped session JWT and
//      set it as an httpOnly cookie. The browser is "remembered" — no prompt.
//   3. If not → frontend collects { email } and POSTs /api/sso/ghl/start to
//      get a 6-digit code emailed to the user.
//   4. User enters the code → /api/sso/ghl/verify mints an SsoDevice row, sets
//      a device cookie (signed JWT carrying the row id, 60-day TTL), and a
//      scoped session cookie.
//
// Threat model:
//   * Static `k` in the URL: protects against random internet scanners.
//     Combined with email-code on first device, leaked `k` alone is useless.
//     Rotate by changing GHL_SSO_KEY env + the GHL menu link URL together.
//   * Session JWT carries `via: 'ghl_sso'` so destructive routes can require
//     a real password+2FA login (see requireFullSession middleware).
//   * Device JWT references a DB row so revocation is server-side
//     (delete-row, or stamp revokedAt). The JWT itself can't be reused after
//     the row is revoked.

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import type { AuthPayload } from '../middleware/auth.js';
import { sendLoginCodeEmail } from './email.service.js';

const DEVICE_TTL_DAYS = 60;
const DEVICE_TTL_MS = DEVICE_TTL_DAYS * 24 * 60 * 60 * 1000;
const SCOPED_SESSION_TTL = '2h';
const EMAIL_CODE_TTL_MIN = 10;
const ENROLL_RATE_LIMIT_PER_HOUR = 5; // codes issued per email per hour

export const DEVICE_COOKIE_NAME = 'ghl_sso_device';
export const SESSION_COOKIE_NAME = 'admin_session';

interface DevicePayload {
  deviceId: string;
  userId: string;
  purpose: 'ghl_sso_device';
}

// ── URL gate: every SSO call must carry the right loc+k ─────────────

export function validateGhlEntry(loc: unknown, k: unknown): void {
  if (!env.GHL_SSO_KEY) {
    throw new AppError(503, 'GHL SSO is not configured on this server');
  }
  if (!env.GHL_LOCATION_ID) {
    throw new AppError(503, 'GHL location is not configured on this server');
  }
  if (typeof loc !== 'string' || typeof k !== 'string') {
    throw new AppError(400, 'Missing loc or k');
  }
  // Constant-time compare to keep us out of the timing-leak business even
  // though `k` is a server-known secret. Length mismatch fails immediately
  // (timingSafeEqual throws if lengths differ).
  const a = Buffer.from(k);
  const b = Buffer.from(env.GHL_SSO_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AppError(403, 'Invalid SSO entry');
  }
  if (loc !== env.GHL_LOCATION_ID) {
    throw new AppError(403, 'Invalid SSO entry');
  }
}

// ── Cookie helpers ──────────────────────────────────────────────────

// We don't pull in cookie-parser. The two cookies we need are simple
// name/value pairs and Express gives us req.headers.cookie raw. Keep parsing
// inline so deploy surface doesn't grow.
export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

// Iframe-friendly cookie. SameSite=None+Secure is the only combination
// browsers honour for third-party iframe contexts (GHL's app loads our
// origin inside its dashboard).
function buildSetCookie(name: string, value: string, maxAgeMs: number): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=/`,
    `HttpOnly`,
    `Secure`,
    `SameSite=None`,
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  return parts.join('; ');
}

function buildClearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

// ── Email enrollment codes (purpose='sso_enroll') ──────────────────

function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  return crypto.randomInt(0, max).toString().padStart(digits, '0');
}

export async function issueEnrollmentCode(email: string): Promise<void> {
  const user = await prisma.adminUser.findUnique({
    where: { email: email.toLowerCase() },
  });

  // Same response whether the user exists or not — don't leak which emails
  // belong to admins. We still throw on inactive accounts because that's
  // a state the user can fix by talking to an admin; silent ignore would
  // be confusing.
  if (!user) return;
  if (!user.active) throw new AppError(403, 'Account is disabled');
  if (user.role !== 'admin' && user.role !== 'sales_rep') {
    throw new AppError(403, 'Account is not allowed to use GHL SSO');
  }

  // Rate-limit: count active sso_enroll codes issued in the last hour for
  // this user. Cheap pre-check; not airtight against parallel races but
  // good enough to make brute-force noisy.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.emailLoginCode.count({
    where: {
      userId: user.id,
      purpose: 'sso_enroll',
      createdAt: { gte: oneHourAgo },
    },
  });
  if (recent >= ENROLL_RATE_LIMIT_PER_HOUR) {
    throw new AppError(429, 'Too many enrollment attempts. Try again later.');
  }

  // Invalidate any prior pending sso_enroll codes so only the newest one
  // is accepted. Doesn't touch 2FA codes (different purpose).
  await prisma.emailLoginCode.deleteMany({
    where: { userId: user.id, usedAt: null, purpose: 'sso_enroll' },
  });

  const code = generateNumericCode(6);
  const codeHash = await bcrypt.hash(code, 10);
  await prisma.emailLoginCode.create({
    data: {
      userId: user.id,
      codeHash,
      purpose: 'sso_enroll',
      expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MIN * 60 * 1000),
    },
  });

  await sendLoginCodeEmail({
    email: user.email,
    code,
    expiresInMinutes: EMAIL_CODE_TTL_MIN,
  });
}

async function verifyEnrollmentCode(userId: string, code: string): Promise<boolean> {
  const rows = await prisma.emailLoginCode.findMany({
    where: {
      userId,
      usedAt: null,
      purpose: 'sso_enroll',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  for (const row of rows) {
    if (await bcrypt.compare(code, row.codeHash)) {
      await prisma.emailLoginCode.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      return true;
    }
  }
  return false;
}

// ── Device enrollment ───────────────────────────────────────────────

export interface EnrollResult {
  setCookies: string[];
  token: string; // session JWT, returned so SPA can stash in localStorage too
  user: { id: string; email: string; role: string; name: string | null };
}

export async function enrollDevice(opts: {
  email: string;
  code: string;
  userAgent?: string;
  ip?: string;
}): Promise<EnrollResult> {
  const user = await prisma.adminUser.findUnique({
    where: { email: opts.email.toLowerCase() },
  });
  if (!user || !user.active) {
    throw new AppError(401, 'Invalid email or code');
  }
  if (user.role !== 'admin' && user.role !== 'sales_rep') {
    throw new AppError(403, 'Account is not allowed to use GHL SSO');
  }

  const ok = await verifyEnrollmentCode(user.id, opts.code.trim());
  if (!ok) throw new AppError(401, 'Invalid email or code');

  const expiresAt = new Date(Date.now() + DEVICE_TTL_MS);
  const device = await prisma.ssoDevice.create({
    data: {
      userId: user.id,
      userAgent: opts.userAgent?.slice(0, 500),
      enrolledIp: opts.ip,
      expiresAt,
    },
  });

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const deviceCookie = jwt.sign(
    { deviceId: device.id, userId: user.id, purpose: 'ghl_sso_device' } satisfies DevicePayload,
    env.JWT_SECRET,
    { expiresIn: `${DEVICE_TTL_DAYS}d` },
  );

  const sessionToken = issueScopedSession(user.id, user.email, user.role);

  return {
    setCookies: [
      buildSetCookie(DEVICE_COOKIE_NAME, deviceCookie, DEVICE_TTL_MS),
      buildSetCookie(SESSION_COOKIE_NAME, sessionToken, 2 * 60 * 60 * 1000),
    ],
    token: sessionToken,
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
  };
}

// Returns a scoped session for the device represented by the cookie. Null
// if the cookie is missing, malformed, or the device row is revoked /
// expired / for an inactive user.
export async function sessionFromDeviceCookie(deviceCookie: string | null): Promise<{
  setCookies: string[];
  token: string;
  user: { id: string; email: string; role: string; name: string | null };
} | null> {
  if (!deviceCookie) return null;

  let payload: DevicePayload;
  try {
    payload = jwt.verify(deviceCookie, env.JWT_SECRET) as DevicePayload;
  } catch {
    return null;
  }
  if (payload.purpose !== 'ghl_sso_device') return null;

  const device = await prisma.ssoDevice.findUnique({ where: { id: payload.deviceId } });
  if (!device) return null;
  if (device.revokedAt) return null;
  if (device.expiresAt.getTime() < Date.now()) return null;
  if (device.userId !== payload.userId) return null;

  const user = await prisma.adminUser.findUnique({ where: { id: device.userId } });
  if (!user || !user.active) return null;
  if (user.role !== 'admin' && user.role !== 'sales_rep') return null;

  // Touch lastSeenAt. Fire-and-forget — not load-bearing.
  prisma.ssoDevice
    .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});

  const sessionToken = issueScopedSession(user.id, user.email, user.role);
  return {
    setCookies: [buildSetCookie(SESSION_COOKIE_NAME, sessionToken, 2 * 60 * 60 * 1000)],
    token: sessionToken,
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
  };
}

// ── Scoped session JWT ─────────────────────────────────────────────

// `via: 'ghl_sso'` marks this session as having reduced privileges.
// requireFullSession middleware rejects it from destructive routes.
function issueScopedSession(userId: string, email: string, role: string): string {
  const payload: AuthPayload = { userId, email, role, via: 'ghl_sso' };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: SCOPED_SESSION_TTL });
}

// ── Logout ─────────────────────────────────────────────────────────

export async function logoutDevice(deviceCookie: string | null): Promise<string[]> {
  if (deviceCookie) {
    try {
      const payload = jwt.verify(deviceCookie, env.JWT_SECRET) as DevicePayload;
      if (payload.purpose === 'ghl_sso_device') {
        await prisma.ssoDevice
          .update({
            where: { id: payload.deviceId },
            data: { revokedAt: new Date() },
          })
          .catch(() => {});
      }
    } catch {
      // Malformed cookie — fine, just clear it.
    }
  }
  return [buildClearCookie(DEVICE_COOKIE_NAME), buildClearCookie(SESSION_COOKIE_NAME)];
}
