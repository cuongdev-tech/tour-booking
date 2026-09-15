import type { Request, Response, NextFunction } from 'express';

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

export function toSafeUser<T extends { passwordHash?: unknown }>(user: T): Omit<T, 'passwordHash'> {
  const { passwordHash: _omitted, ...safe } = user;
  return safe;
}

export function generateBookingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `TB-${suffix}`;
}

export function generateTransactionCode(method: string): string {
  return `${method}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4)
    .toString()
    .padStart(4, '0')}`;
}
