import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './error-handler.js';

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
  // How the session was minted. 'password' (or absent, for legacy tokens)
  // = full session from email+password+2FA. 'ghl_sso' = the user re-entered
  // via the GHL embed device cookie; destructive routes must reject this.
  via?: 'password' | 'ghl_sso';
}

declare global {
  namespace Express {
    interface Request {
      admin?: AuthPayload;
    }
  }
}

// Look first at Authorization: Bearer <token> (the existing localStorage
// path), then fall back to the admin_session cookie (set by the SSO flow).
// This lets the GHL-embedded admin portal authenticate without ever having
// a Bearer token in localStorage on the iframe origin.
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);

  const cookie = req.headers.cookie;
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === 'admin_session') {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) throw new AppError(401, 'Missing authorization token');

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    // Backfill role for legacy tokens issued before the role field existed.
    req.admin = { ...payload, role: payload.role ?? 'admin' };
    next();
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }
}

// Best-effort auth: populates req.admin when a valid token is present but
// never rejects. Use on public routes that unlock extra admin-only behavior
// (e.g. POST /api/quotes accepting existing-customer / no-package payloads
// only from the admin quote builder).
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
      req.admin = { ...payload, role: payload.role ?? 'admin' };
    } catch {
      // Invalid/expired token on a public route: proceed unauthenticated.
    }
  }
  next();
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

// Rejects sessions that were minted via the GHL passwordless SSO flow.
// Use on destructive / privilege-escalation routes (user invite/role
// change/delete, 2FA reset) so a compromised GHL account can't be used
// to escalate beyond read/write on quotes. The user has to come in
// through the normal password+2FA login to perform these actions.
export function requireFullSession(req: Request, _res: Response, next: NextFunction) {
  if (!req.admin) throw new AppError(401, 'Not authenticated');
  if (req.admin.via === 'ghl_sso') {
    throw new AppError(403, 'This action requires a full login (password + 2FA), not the GHL embed session');
  }
  next();
}
