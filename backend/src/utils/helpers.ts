import type { Request, Response, NextFunction } from 'express';
import { randomInt } from 'node:crypto';

export class AppError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };

export function toSafeUser<T extends { passwordHash?: unknown; passwordResetToken?: unknown; passwordResetExpires?: unknown; emailVerifyToken?: unknown; emailVerifyExpires?: unknown }>(
  user: T,
): Omit<T, 'passwordHash' | 'passwordResetToken' | 'passwordResetExpires' | 'emailVerifyToken' | 'emailVerifyExpires'> {
  const { passwordHash: _omitted, passwordResetToken: _omitted2, passwordResetExpires: _omitted3, emailVerifyToken: _omitted4, emailVerifyExpires: _omitted5, ...safe } = user;
  return safe;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateBookingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += chars[randomInt(chars.length)];
  return `TB-${suffix}`;
}

export function generateTransactionCode(method: string): string {
  return `${method}-${Date.now().toString(36).toUpperCase()}${randomInt(1e4)
    .toString()
    .padStart(4, '0')}`;
}
