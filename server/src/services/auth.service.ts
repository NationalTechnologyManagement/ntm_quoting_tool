// Auth + 2FA flow.
//
// Login is a two-step dance now:
//   1. POST /api/admin/login  → verify password. If user has no 2FA configured,
//      return { needsSetup: true, setupToken } so the client sends the user to
//      the 2FA enrollment screen. If they're enrolled, return
//      { needs2fa: true, challengeToken, method } so the client prompts for code.
//   2. POST /api/admin/login/verify → verify TOTP or email code (or recovery code)
//      and return the final long-lived JWT.
//
// challengeToken / setupToken are short-lived (5 min) signed JWTs encoding
// the userId + a purpose tag, so the second step can authenticate the user
// without trusting client state.
//
// Existing seeded admin row is auto-upgraded: with twoFactorMethod=null,
// the password check returns { needsSetup: true } and forces enrollment
// on first login post-deploy.

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import type { AuthPayload } from '../middleware/auth.js';
import {
  buildOtpauthUri,
  buildQrDataUrl,
  generateRecoveryCodes,
  generateSecret,
  verifyTotp,
} from './totp.service.js';
import { sendLoginCodeEmail } from './email.service.js';

const CHALLENGE_TTL = '5m';
const SESSION_TTL = '24h';
const EMAIL_CODE_TTL_MIN = 10;

type ChallengePurpose = 'verify_2fa' | 'setup_2fa';

interface ChallengePayload {
  userId: string;
  purpose: ChallengePurpose;
}

function signChallenge(payload: ChallengePayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: CHALLENGE_TTL });
}

function verifyChallenge(token: string, expected: ChallengePurpose): ChallengePayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as ChallengePayload;
    if (decoded.purpose !== expected) {
      throw new AppError(401, 'Challenge token has wrong purpose');
    }
    return decoded;
  } catch (e: any) {
    if (e instanceof AppError) throw e;
    throw new AppError(401, 'Challenge token invalid or expired');
  }
}

function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  // crypto.randomInt is uniformly distributed; padStart handles leading zeros.
  return crypto.randomInt(0, max).toString().padStart(digits, '0');
}

function issueSessionToken(userId: string, email: string, role: string): string {
  const payload: AuthPayload = { userId, email, role };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: SESSION_TTL });
}

// ── Step 1: password ─────────────────────────────────────────────────

export type LoginResult =
  | {
      status: 'ok';
      token: string;
      user: { id: string; email: string; role: string; name: string | null };
    }
  | {
      status: 'needs_setup';
      setupToken: string;
      email: string;
    }
  | {
      status: 'needs_2fa';
      challengeToken: string;
      method: 'totp' | 'email';
      email: string;
    };

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.active) throw new AppError(401, 'Invalid credentials');
  if (!user.passwordHash) {
    throw new AppError(401, 'Account exists but has not finished invite setup');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError(401, 'Invalid credentials');

  if (!user.twoFactorMethod) {
    return {
      status: 'needs_setup',
      setupToken: signChallenge({ userId: user.id, purpose: 'setup_2fa' }),
      email: user.email,
    };
  }

  if (user.twoFactorMethod === 'email') {
    await issueEmailCode(user.id, user.email);
  }

  return {
    status: 'needs_2fa',
    challengeToken: signChallenge({ userId: user.id, purpose: 'verify_2fa' }),
    method: user.twoFactorMethod as 'totp' | 'email',
    email: user.email,
  };
}

// ── Email codes (for the email-2FA variant) ─────────────────────────

async function issueEmailCode(userId: string, email: string): Promise<void> {
  // Invalidate any pending codes for this user.
  await prisma.emailLoginCode.deleteMany({ where: { userId, usedAt: null } });

  const code = generateNumericCode(6);
  const codeHash = await bcrypt.hash(code, 10);
  await prisma.emailLoginCode.create({
    data: {
      userId,
      codeHash,
      expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MIN * 60 * 1000),
    },
  });

  await sendLoginCodeEmail({ email, code, expiresInMinutes: EMAIL_CODE_TTL_MIN });
}

export async function resendEmailCode(challengeToken: string): Promise<void> {
  const { userId } = verifyChallenge(challengeToken, 'verify_2fa');
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user || user.twoFactorMethod !== 'email') {
    throw new AppError(400, 'Email codes are not enabled for this account');
  }
  await issueEmailCode(user.id, user.email);
}

async function verifyEmailCode(userId: string, code: string): Promise<boolean> {
  const rows = await prisma.emailLoginCode.findMany({
    where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  for (const row of rows) {
    if (await bcrypt.compare(code, row.codeHash)) {
      await prisma.emailLoginCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      return true;
    }
  }
  return false;
}

// ── Step 2: verify the 2FA factor and issue session ─────────────────

export async function verifyTwoFactor(
  challengeToken: string,
  code: string,
): Promise<{
  token: string;
  user: { id: string; email: string; role: string; name: string | null };
}> {
  const { userId } = verifyChallenge(challengeToken, 'verify_2fa');
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user || !user.active) throw new AppError(401, 'Account not available');

  let ok = false;
  const trimmed = (code || '').trim();

  // Recovery-code path. Recovery codes are stored as bcrypt hashes in a JSON
  // array; matching one consumes it (we splice it out and persist).
  const recoveryHashes: string[] = Array.isArray(user.recoveryCodesHash)
    ? (user.recoveryCodesHash as unknown as string[])
    : [];
  for (let i = 0; i < recoveryHashes.length; i++) {
    if (await bcrypt.compare(trimmed, recoveryHashes[i])) {
      const remaining = [...recoveryHashes.slice(0, i), ...recoveryHashes.slice(i + 1)];
      await prisma.adminUser.update({
        where: { id: user.id },
        data: { recoveryCodesHash: remaining },
      });
      ok = true;
      break;
    }
  }

  if (!ok && user.twoFactorMethod === 'totp' && user.twoFactorSecret) {
    ok = verifyTotp(user.twoFactorSecret, trimmed);
  }
  if (!ok && user.twoFactorMethod === 'email') {
    ok = await verifyEmailCode(user.id, trimmed);
  }

  if (!ok) throw new AppError(401, 'Invalid verification code');

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    token: issueSessionToken(user.id, user.email, user.role),
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
  };
}

// ── 2FA setup ───────────────────────────────────────────────────────

export async function start2faSetup(setupToken: string, method: 'totp' | 'email') {
  const { userId } = verifyChallenge(setupToken, 'setup_2fa');
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');

  if (method === 'totp') {
    const secret = generateSecret();
    const uri = buildOtpauthUri({ label: user.email, issuer: 'NTM Quoting', secret });
    const qrDataUrl = await buildQrDataUrl(uri);
    // Stash the *candidate* secret on the user so confirm step can read it.
    // We overwrite any prior pending setup; the secret only becomes active
    // once confirm2faSetup succeeds and twoFactorMethod is set.
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret, twoFactorMethod: null },
    });
    return { method: 'totp' as const, secret, otpauthUri: uri, qrDataUrl };
  }

  // Email method — issue the first code right away so the user can confirm.
  await issueEmailCode(user.id, user.email);
  return { method: 'email' as const, email: user.email };
}

export async function confirm2faSetup(
  setupToken: string,
  method: 'totp' | 'email',
  code: string,
): Promise<{
  token: string;
  user: { id: string; email: string; role: string; name: string | null };
  recoveryCodes: string[];
}> {
  const { userId } = verifyChallenge(setupToken, 'setup_2fa');
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');

  let ok = false;
  if (method === 'totp') {
    if (!user.twoFactorSecret) throw new AppError(400, 'Start TOTP setup first');
    ok = verifyTotp(user.twoFactorSecret, code);
  } else {
    ok = await verifyEmailCode(user.id, code);
  }
  if (!ok) throw new AppError(401, 'Invalid code');

  const recoveryCodes = generateRecoveryCodes(10);
  const hashes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));

  await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      twoFactorMethod: method,
      recoveryCodesHash: hashes,
      lastLoginAt: new Date(),
      // For email method, clear any stale TOTP secret left over from a
      // previous attempt.
      ...(method === 'email' ? { twoFactorSecret: null } : {}),
    },
  });

  return {
    token: issueSessionToken(user.id, user.email, user.role),
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
    recoveryCodes,
  };
}

// ── Token validation + middleware helpers ───────────────────────────

export async function validateToken(token: string) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    const user = await prisma.adminUser.findUnique({ where: { id: payload.userId } });
    if (!user || !user.active) return null;
    return { id: user.id, email: user.email, role: user.role, name: user.name };
  } catch {
    return null;
  }
}

// ── Password change (authenticated user, no 2FA prompt) ─────────────

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) throw new AppError(404, 'User not found');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new AppError(401, 'Current password is incorrect');
  if (newPassword.length < 8) {
    throw new AppError(400, 'New password must be at least 8 characters');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.adminUser.update({ where: { id: userId }, data: { passwordHash } });
}

// ── 2FA reset (admin-only — wipes user's enrolled factor) ───────────

export async function resetUserTwoFactor(userId: string) {
  await prisma.adminUser.update({
    where: { id: userId },
    data: {
      twoFactorMethod: null,
      twoFactorSecret: null,
      recoveryCodesHash: [],
    },
  });
  await prisma.emailLoginCode.deleteMany({ where: { userId } });
}

export { issueEmailCode };
