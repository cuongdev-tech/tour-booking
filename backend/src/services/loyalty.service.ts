import { randomInt } from 'node:crypto';
import { prisma } from '../config/env.js';

export const POINTS_PER_VND = 1000;
export const EARN_RATE_VND = 10000;
export const REFERRAL_REWARD = 100;
export const REFERRAL_BONUS = 50;
export const MAX_REDEEM_RATIO = 0.2;

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i += 1) s += chars[randomInt(chars.length)];
  return `REF-${s}`;
}

export async function ensureReferralCode(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (u?.referralCode) return u.referralCode;
  for (let i = 0; i < 5; i += 1) {
    const code = genCode();
    const clash = await prisma.user.findFirst({ where: { referralCode: code } });
    if (clash) continue;
    const updated = await prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } });
    if (updated.count === 1) return code;
    const reread = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
    if (reread?.referralCode) return reread.referralCode;
  }
  const fallback = `REF-${userId.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase()}${randomInt(10)}`;
  await prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: fallback } });
  const reread = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  return reread?.referralCode ?? fallback;
}

export async function applyReferral(newUserId: string, codeRaw?: string): Promise<void> {
  const code = codeRaw?.trim().toUpperCase();
  if (!code) return;
  const referrer = await prisma.user.findFirst({ where: { referralCode: code } });
  if (!referrer || referrer.id === newUserId) return;
  if (referrer.status !== 'ACTIVE') return;
  await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUnique({ where: { id: newUserId }, select: { referredById: true } });
    if (!me || me.referredById) return; // idempotent: only first referral counts
    await tx.user.update({ where: { id: newUserId }, data: { referredById: referrer.id } });
    await tx.user.update({ where: { id: referrer.id }, data: { loyaltyPoints: { increment: REFERRAL_REWARD } } });
    await tx.loyaltyTransaction.create({
      data: { userId: referrer.id, points: REFERRAL_REWARD, type: 'REFERRAL_REWARD', bookingId: null },
    });
    await tx.user.update({ where: { id: newUserId }, data: { loyaltyPoints: { increment: REFERRAL_BONUS } } });
    await tx.loyaltyTransaction.create({
      data: { userId: newUserId, points: REFERRAL_BONUS, type: 'REFERRAL_BONUS', bookingId: null },
    });
  });
}

export function loyaltyDiscountFor(points: number, subtotal: number): number {
  if (points <= 0 || subtotal <= 0) return 0;
  const byPoints = points * POINTS_PER_VND;
  const cap = Math.floor(subtotal * MAX_REDEEM_RATIO);
  return Math.min(byPoints, cap, subtotal);
}

export async function getLoyalty(userId: string) {
  const code = await ensureReferralCode(userId);
  const [user, tx] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { loyaltyPoints: true, referralCode: true } }),
    prisma.loyaltyTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  return { points: user?.loyaltyPoints ?? 0, referralCode: code, transactions: tx };
}
