import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import { sendAdminInviteEmail } from './email.service.js';

const INVITE_TTL_HOURS = 72;
const VALID_ROLES = ['admin', 'sales_rep'] as const;
export type AdminRole = (typeof VALID_ROLES)[number];

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function isValidRole(role: string): role is AdminRole {
  return (VALID_ROLES as readonly string[]).includes(role);
}

// Generate a 32-byte URL-safe token. We store only the sha256 of it, so a
// DB leak yields useless hashes. The plaintext goes out exactly once in the
// invite email.
function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createInvite(opts: {
  email: string;
  role: string;
  invitedById: string;
  inviterName: string;
}): Promise<{ inviteId: string; token: string; expiresAt: Date }> {
  if (!isValidRole(opts.role)) throw new AppError(400, `Invalid role: ${opts.role}`);

  const email = opts.email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, 'Invalid email address');
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, 'A user with that email already exists');
  }

  // Drop any prior unaccepted invites for this email so the new link is the
  // only one that works.
  await prisma.invite.deleteMany({ where: { email, acceptedAt: null } });

  const token = generateToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  const invite = await prisma.invite.create({
    data: {
      email,
      role: opts.role,
      tokenHash,
      expiresAt,
      invitedById: opts.invitedById,
    },
  });

  const acceptUrl = `${env.FRONTEND_URL}/admin/accept-invite?token=${token}`;
  await sendAdminInviteEmail({
    inviteeEmail: email,
    inviterName: opts.inviterName,
    role: opts.role,
    acceptUrl,
    expiresAt,
  });

  return { inviteId: invite.id, token, expiresAt };
}

export async function getInviteByToken(token: string) {
  const tokenHash = sha256Hex(token);
  const invite = await prisma.invite.findUnique({ where: { tokenHash } });
  if (!invite) throw new AppError(404, 'Invite not found');
  if (invite.acceptedAt) throw new AppError(410, 'Invite already used');
  if (invite.expiresAt < new Date()) throw new AppError(410, 'Invite expired');
  return invite;
}

export async function acceptInvite(opts: {
  token: string;
  name: string;
  password: string;
}): Promise<{
  userId: string;
  email: string;
  role: string;
  setupToken: string;
}> {
  if (opts.password.length < 8) {
    throw new AppError(400, 'Password must be at least 8 characters');
  }

  const invite = await getInviteByToken(opts.token);
  const passwordHash = await bcrypt.hash(opts.password, 12);

  // Use a transaction so the invite is consumed atomically with user creation.
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.adminUser.create({
      data: {
        email: invite.email,
        name: opts.name.trim() || invite.email.split('@')[0],
        passwordHash,
        role: invite.role,
        active: true,
      },
    });
    await tx.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedUserId: user.id },
    });
    return user;
  });

  // Pass back a short-lived setup token so the client can go straight into
  // 2FA enrollment without making the user re-enter their password.
  const setupToken = jwt.sign(
    { userId: result.id, purpose: 'setup_2fa' },
    env.JWT_SECRET,
    { expiresIn: '15m' },
  );

  return {
    userId: result.id,
    email: result.email,
    role: result.role,
    setupToken,
  };
}

export async function listInvites() {
  return prisma.invite.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      invitedBy: { select: { id: true, email: true, name: true } },
    },
  });
}

export async function revokeInvite(id: string) {
  await prisma.invite.deleteMany({ where: { id, acceptedAt: null } });
}
