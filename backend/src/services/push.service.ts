import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
}

export async function subscribe(userId: string, input: PushKeys) {
  const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: input.endpoint } });
  // An endpoint belongs to one device/user — never silently reassign it.
  if (existing && existing.userId !== userId) throw new AppError(409, 'Push endpoint already registered');
  if (existing) {
    return prisma.pushSubscription.update({
      where: { endpoint: input.endpoint },
      data: { p256dh: input.p256dh, auth: input.auth },
    });
  }
  return prisma.pushSubscription.create({
    data: { userId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth },
  });
}

export async function unsubscribe(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return { success: true };
}

export function listMine(userId: string) {
  return prisma.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

/**
 * Indirect dynamic import (string-only specifier) so this module compiles
 * even when the optional 'web-push' dependency is not installed — the
 * missing-package error is caught below and degrades to { skipped: true }.
 */
async function loadWebPush(): Promise<any> {
  try {
    const dynImport = new Function('name', 'return import(name)') as (m: string) => Promise<any>;
    return await dynImport('web-push');
  } catch {
    return null;
  }
}

export async function sendToUser(userId: string, payload: PushPayload) {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || '';
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com';
  const webpush = await loadWebPush();
  if (!webpush || !publicKey || !privateKey) {
    console.warn('[push] web-push unavailable or VAPID keys missing; skipping send');
    return { sent: 0, skipped: true };
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch {
    console.warn('[push] invalid VAPID configuration; skipping send');
    return { sent: 0, skipped: true };
  }
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify({ title: payload.title, body: payload.body ?? '', url: payload.url ?? '/' });
  let sent = 0;
  for (const sub of subs) {
    try {
      const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } as never;
      await webpush.sendNotification(subscription, body as never);
      sent += 1;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number } | null)?.statusCode;
      // Gone/unregistered endpoints are pruned so future sends stay clean.
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      }
    }
  }
  return { sent, skipped: false };
}
