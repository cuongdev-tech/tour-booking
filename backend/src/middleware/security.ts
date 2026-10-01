import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/helpers.js';

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory buckets (per process). Enough to blunt brute-force / probing on a
// single-instance deployment; resets on restart by design.
const buckets = new Map<string, Bucket>();

function prune(now: number): void {
  if (buckets.size < 5000) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Fixed-window rate limiter. Throws 429 (handled by errorHandler) with a
 * Retry-After hint when the budget is exhausted.
 * `name` scopes the bucket: without it, all limiter instances would share one
 * counter per IP (e.g. verify-page polling eating the coupon budget).
 */
export function rateLimit({ windowMs, max, name }: { windowMs: number; max: number; name: string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    prune(now);
    const key = `${name}:${req.ip ?? 'unknown'}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      throw new AppError(429, 'Too many requests, please try again later');
    }
    next();
  };
}

/** Minimal security headers (no helmet dependency). */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
}
