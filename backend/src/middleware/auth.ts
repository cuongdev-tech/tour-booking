import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/env.js';
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

export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  // Token claims đi kèm 7 ngày: role/status trong token có thể cũ (vừa bị hạ
  // quyền/khóa). Đọc live từ DB trên các route nhạy cảm (lưu lượng thấp).
  const dbUser = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { role: true, status: true },
  });
  if (!dbUser || dbUser.status !== 'ACTIVE' || dbUser.role !== 'ADMIN') {
    throw new AppError(403, 'Admin access required');
  }
  next();
}

/**
 * Customer-only actions (currently: creating bookings). Admin accounts manage
 * everything but never book — they test the customer flow with a CUSTOMER
 * account instead of self-dealing on their own bookings.
 */
export async function requireCustomer(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  // Như requireAdmin: tài khoản bị khóa/hạ quyền không được đặt tour bằng token cũ.
  const dbUser = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { role: true, status: true },
  });
  if (!dbUser || dbUser.status !== 'ACTIVE') throw new AppError(403, 'Account is disabled');
  if (dbUser.role !== 'CUSTOMER') throw new AppError(403, 'Admin accounts cannot place bookings');
  next();
}
