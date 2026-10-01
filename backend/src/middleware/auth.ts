import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth.js';
import { AppError } from '../utils/helpers.js';

export interface AuthPayload {
  id: string;
  role: 'CUSTOMER' | 'ADMIN';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing or invalid authorization header');
  }
  try {
    const payload = verifyToken(header.slice(7)) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    throw new AppError(401, 'Token expired or invalid');
  }
}

/**
 * Optional auth: attach the user when a valid token is present, otherwise
 * continue as guest (no 401). Expired/invalid tokens are ignored, never fatal.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyToken(header.slice(7)) as AuthPayload;
    } catch {
      req.user = undefined;
    }
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  if (req.user.role !== 'ADMIN') throw new AppError(403, 'Admin access required');
  next();
}

/**
 * Customer-only actions (currently: creating bookings). Admin accounts manage
 * everything but never book — they test the customer flow with a CUSTOMER
 * account instead of self-dealing on their own bookings.
 */
export function requireCustomer(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  if (req.user.role !== 'CUSTOMER') throw new AppError(403, 'Admin accounts cannot place bookings');
  next();
}
