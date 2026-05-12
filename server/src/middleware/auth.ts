import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './error-handler.js';

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing authorization token');
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    // Backfill role for legacy tokens issued before the role field existed.
    req.admin = { ...payload, role: payload.role ?? 'admin' };
    next();
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }
}

// Role gate. Pass one or more role names; the authenticated user must hold
// one of them. Always chain after requireAuth.
export function requireRole(...allowed: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) throw new AppError(401, 'Not authenticated');
    if (!allowed.includes(req.admin.role)) {
      throw new AppError(403, 'You do not have permission to do that');
    }
    next();
  };
}
