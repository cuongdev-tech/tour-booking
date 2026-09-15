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

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  if (req.user.role !== 'ADMIN') throw new AppError(403, 'Admin access required');
  next();
}
