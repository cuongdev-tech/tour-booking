import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/env.js';
import { verifyToken } from '../utils/auth.js';
import { AppError } from '../utils/helpers.js';

export interface AuthPayload {
  id: string;
  role: 'CUSTOMER' | 'ADMIN';
  tv?: number;
  iat?: number;
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
  // Token claims đi kèm TTL ngắn + tv: role/status/tv trong token có thể cũ
  // (vừa bị hạ quyền/khóa/đổi pass). Đọc live từ DB trên các route nhạy cảm.
  const dbUser = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { role: true, status: true, tokenVersion: true },
  });
  if (!dbUser || dbUser.status !== 'ACTIVE' || dbUser.role !== 'ADMIN') {
    throw new AppError(403, 'Admin access required');
  }
  if (req.user.tv !== undefined && (dbUser.tokenVersion ?? 0) !== req.user.tv) {
    throw new AppError(401, 'Token expired or invalid');
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
  // Như requireAdmin: tài khoản bị khóa/hạ quyền/đổi pass không được đặt tour bằng token cũ.
  const dbUser = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { role: true, status: true, tokenVersion: true },
  });
  if (!dbUser || dbUser.status !== 'ACTIVE') throw new AppError(403, 'Account is disabled');
  if (req.user.tv !== undefined && (dbUser.tokenVersion ?? 0) !== req.user.tv) {
    throw new AppError(401, 'Token expired or invalid');
  }
  if (dbUser.role !== 'CUSTOMER') throw new AppError(403, 'Admin accounts cannot place bookings');
  next();
}

/**
 * Any authenticated + active user (CUSTOMER or ADMIN). Use after requireAuth
 * for read/cancel/review/favorite routes that must reject locked accounts
 * even when the JWT itself is still valid (7-day TTL).
 */
export async function requireActiveUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  const dbUser = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { status: true, tokenVersion: true },
  });
  if (!dbUser || dbUser.status !== 'ACTIVE') throw new AppError(403, 'Account is disabled');
  if (req.user.tv !== undefined && (dbUser.tokenVersion ?? 0) !== req.user.tv) {
    throw new AppError(401, 'Token expired or invalid');
  }
  next();
}

/**
 * Resolve the live role from DB (never trust the JWT claim — it can be stale
 * for 7 days after a role change). Returns true for active admins only.
 */
export async function isLiveAdmin(userId: string): Promise<boolean> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  });
  return dbUser?.status === 'ACTIVE' && dbUser?.role === 'ADMIN';
}

/**
 * Email-verified customers only (booking, review). Admins bypass (they never
 * book; internal accounts are backfilled verified). Respond 403 with a stable
 * message the FE maps to a resend-verification prompt.
 */
export async function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  const dbUser = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { role: true, status: true, emailVerified: true, tokenVersion: true },
  });
  if (!dbUser || dbUser.status !== 'ACTIVE') throw new AppError(403, 'Account is disabled');
  if (req.user.tv !== undefined && (dbUser.tokenVersion ?? 0) !== req.user.tv) {
    throw new AppError(401, 'Token expired or invalid');
  }
  if (dbUser.role === 'ADMIN') {
    next();
    return;
  }
  if (!dbUser.emailVerified) throw new AppError(403, 'Email verification required');
  next();
}
