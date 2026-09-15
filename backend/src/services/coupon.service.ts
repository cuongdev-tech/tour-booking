import { PrismaClient } from '@prisma/client';
import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';

/** Minimal DB surface needed for coupon checks — works with PrismaClient and $transaction clients. */
type CouponDb = Pick<PrismaClient, 'coupon'>;

/** Validate coupon and compute discount. Discount never exceeds subtotal. */
export async function resolveCoupon(
  couponCode: string | undefined,
  subtotal: number,
  db: CouponDb = prisma,
) {
  if (!couponCode) return { couponId: null as string | null, discount: 0 };
  const code = couponCode.trim().toUpperCase();
  if (!code) return { couponId: null as string | null, discount: 0 };

  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon) throw new AppError(400, 'Coupon does not exist');
  if (!coupon.active) throw new AppError(400, 'Coupon is inactive');
  if (coupon.expiresAt.getTime() < Date.now()) throw new AppError(400, 'Coupon has expired');
  if (subtotal < coupon.minOrder)
    throw new AppError(400, `Coupon requires minimum order of ${coupon.minOrder.toLocaleString('vi-VN')}₫`);
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit)
    throw new AppError(400, 'Coupon usage limit exceeded');

  const raw = coupon.type === 'PERCENT' ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
  const discount = Math.min(raw, subtotal);
  return { couponId: coupon.id, discount };
}

export async function validateCouponForDisplay(code: string, subtotal: number) {
  const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon) throw new AppError(400, 'Coupon does not exist');
  if (!coupon.active) throw new AppError(400, 'Coupon is inactive');
  if (coupon.expiresAt.getTime() < Date.now()) throw new AppError(400, 'Coupon has expired');
  if (subtotal < coupon.minOrder)
    throw new AppError(400, `Coupon requires minimum order of ${coupon.minOrder.toLocaleString('vi-VN')}₫`);
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit)
    throw new AppError(400, 'Coupon usage limit exceeded');
  const raw = coupon.type === 'PERCENT' ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
  return { coupon, discount: Math.min(raw, subtotal) };
}
