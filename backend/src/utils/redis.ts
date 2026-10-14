import { Redis } from 'ioredis';
import { env } from '../config/env.js';

type RedisClient = InstanceType<typeof Redis>;

let client: RedisClient | null = null;
let warned = false;

function warnOnce(msg: string, err?: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(msg, err instanceof Error ? err.message : err ?? '');
}

/** Shared Redis client when REDIS_URL is set, else null (memory fallback). */
export function getRedis(): RedisClient | null {
  if (!env.redisUrl) return null;
  if (client) return client;
  try {
    client = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times: number) => (times > 3 ? null : Math.min(200 * times, 1000)),
    });
    client.on('error', (err: Error) => warnOnce('[rate-limit] redis error, falling back to memory:', err));
  } catch (err) {
    warnOnce('[rate-limit] redis init failed, falling back to memory:', err);
    client = null;
  }
  return client;
}

/**
 * Fixed-window increment: returns {count, ttlMs} after increment.
 * Atomic via Lua (INCR + PEXPIRE in one round-trip; no key without TTL).
 */
export async function redisIncrWindow(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }> {
  const r = getRedis();
  if (!r) throw new Error('redis disabled');
  const res = (await r.eval(
    `local c = redis.call('INCR', KEYS[1]); local ttl = redis.call('PTTL', KEYS[1]); if c == 1 or ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]); end; return {c, ttl};`,
    1,
    key,
    String(windowMs),
  )) as [number, number];
  const count = Number(res[0]);
  const ttlMs = Number(res[1]);
  return { count, ttlMs: ttlMs < 0 ? windowMs : ttlMs };
}
