import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import type { AuthPayload } from '../middleware/auth.js';

export async function login(email: string, password: string) {
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user) throw new AppError(401, 'Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError(401, 'Invalid credentials');

  const payload: AuthPayload = { userId: user.id, email: user.email };
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '24h' });

  return { token, user: { id: user.id, email: user.email } };
}

export async function validateToken(token: string) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    const user = await prisma.adminUser.findUnique({
      where: { id: payload.userId },
    });
    if (!user) return null;
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}
