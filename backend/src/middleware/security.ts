import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/helpers.js';
import { getRedis, redisIncrWindow } from '../utils/redis.js';

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory fallback (single instance / dev / Redis down). When REDIS_URL is
// set, counters live in Redis so every replica shares the same budget.
const buckets = new Map<string, Bucket>();
let lastPrune = 0;

function prune(now: number): void {
  // Periodic prune regardless of size (prevents slow IP-rotation bloat).
  if (now - lastPrune < 60_000 && buckets.size < 5000) return;
  lastPrune = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
  // Hard cap: drop oldest expiries first if still huge.
  if (buckets.size > 20000) {
    const sorted = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (let i = 0; i < buckets.size - 20000; i += 1) buckets.delete(sorted[i][0]);
  }
}

function memoryHit(key: string, windowMs: number, max: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * Fixed-window rate limiter. Throws 429 (handled by errorHandler) with a
 * Retry-After hint when the budget is exhausted.
 * `name` scopes the bucket: without it, all limiter instances would share one
 * counter per IP (e.g. verify-page polling eating the coupon budget).
 * Shared via Redis when REDIS_URL is set, else in-memory fallback.
 */
export function rateLimit({ windowMs, max, name }: { windowMs: number; max: number; name: string }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `${name}:${req.ip ?? 'unknown'}`;
    if (getRedis()) {
      try {
        const { count, ttlMs } = await redisIncrWindow(`rl:${key}`, windowMs);
        if (count > max) {
          res.setHeader('Retry-After', String(Math.ceil(ttlMs / 1000)));
          next(new AppError(429, 'Too many requests, please try again later'));
          return;
        }
        next();
        return;
      } catch {
        // fall through to memory
      }
    }
    // Redis disabled/down => memory fallback (fail-open, never 500 on limiter).
    const m = memoryHit(key, windowMs, max);
    if (!m.allowed) {
      res.setHeader('Retry-After', String(m.retryAfterSec));
      next(new AppError(429, 'Too many requests, please try again later'));
      return;
    }
    next();
  };
}

/** Minimal security headers (no helmet dependency). */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Basic hardening without a dependency: no MIME-sniffed XSS, no clickjacking
  // (above), no geolocation/mic/camera for this app, HSTS only when TLS is used.
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

/**
 * Per-account throttle for login (keyed by normalized email): 10 attempts per
 * 15 minutes per account, independent of IP. Complements the per-IP limiter —
 * an attacker rotating IPs still can't brute-force one account, and one bad
 * actor can't lock out unrelated users sharing an IP.
 */
const accountBuckets = new Map<string, Bucket>();

async function sharedHit(key: string, windowMs: number, max: number): Promise<{ allowed: boolean; retryAfterSec: number }> {
  if (getRedis()) {
    try {
      const { count, ttlMs } = await redisIncrWindow(`rl:${key}`, windowMs);
      if (count > max) return { allowed: false, retryAfterSec: Math.ceil(ttlMs / 1000) };
      return { allowed: true, retryAfterSec: 0 };
    } catch {
      // fall through to memory
    }
  }
  return memoryHit(key, windowMs, max);
}

export function loginAccountThrottle(req: Request, _res: Response, next: NextFunction): void {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  if (!email) {
    next();
    return;
  }
  const key = `login-account:${email}`;
  void sharedHit(key, 15 * 60 * 1000, 10)
    .then((r) => {
      if (!r.allowed) next(new AppError(429, 'Too many requests, please try again later'));
      else next();
    })
    .catch(() => next());
}

/**
 * Per-email throttle for password-reset (3/hour/email): the IP limiter alone
 * lets an attacker rotate IPs to spam one victim's inbox and churn their
 * reset token (new token invalidates the old link).
 */
const resetEmailBuckets = new Map<string, Bucket>();
void accountBuckets;
void resetEmailBuckets;

export function forgotPasswordEmailThrottle(req: Request, _res: Response, next: NextFunction): void {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  if (!email) {
    next();
    return;
  }
  const key = `forgot-email:${email}`;
  void sharedHit(key, 60 * 60 * 1000, 3)
    .then((r) => {
      if (!r.allowed) next(new AppError(429, 'Too many requests, please try again later'));
      else next();
    })
    .catch(() => next());
}
