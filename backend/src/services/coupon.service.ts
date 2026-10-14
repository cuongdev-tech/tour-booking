import { PrismaClient } from '@prisma/client';
import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';

/** Minimal DB surface needed for coupon checks — works with PrismaClient and $transaction clients. */
type CouponDb = Pick<PrismaClient, 'coupon'>;

export interface CouponContext {
  tourId?: string;
  category?: string;
  guests?: number;
}

function parseTourIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/** Validate coupon and compute discount. Discount never exceeds subtotal. */
export async function resolveCoupon(
  couponCode: string | undefined,
  subtotal: number,
  db: CouponDb = prisma,
  ctx: CouponContext = {},
) {
  if (!couponCode) return { couponId: null as string | null, discount: 0 };
  const code = couponCode.trim().toUpperCase();
  if (!code) return { couponId: null as string | null, discount: 0 };

  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon) throw new AppError(400, 'Coupon does not exist');
  if (!coupon.active) throw new AppError(400, 'Coupon is inactive');
  const now = Date.now();
  if (coupon.startsAt && coupon.startsAt.getTime() > now) throw new AppError(400, 'Coupon is not active yet');
  if (coupon.expiresAt.getTime() < now) throw new AppError(400, 'Coupon has expired');
  if (subtotal < coupon.minOrder)
    throw new AppError(400, `Coupon requires minimum order of ${coupon.minOrder.toLocaleString('vi-VN')}₫`);
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit)
    throw new AppError(400, 'Coupon usage limit exceeded');
  // Family combo: coupon requires a minimum party size.
  const needGuests = (coupon as { minGuests?: number }).minGuests ?? 0;
  if (ctx.guests !== undefined && needGuests > 0) {
    if (ctx.guests < needGuests) throw new AppError(400, `Coupon requires at least ${needGuests} guest(s)`);
  }
  // Tour-scoped promos: non-empty applicableTourIds restricts to those tours.
  // Strict: a scoped coupon without tour context cannot be validated loosely.
  const scoped = parseTourIds((coupon as { applicableTourIds?: unknown }).applicableTourIds);
  if (scoped.length > 0) {
    if (!ctx.tourId) throw new AppError(400, 'Coupon is not applicable to this tour');
    if (!scoped.includes(ctx.tourId)) throw new AppError(400, 'Coupon is not applicable to this tour');
  }
  const cat = (coupon as { applicableCategory?: string | null }).applicableCategory;
  if (cat) {
    if (!ctx.category) throw new AppError(400, 'Coupon is not applicable to this tour');
    if (ctx.category !== cat) throw new AppError(400, 'Coupon is not applicable to this tour');
  }

  let raw = coupon.type === 'PERCENT' ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
  const cap = (coupon as { maxDiscount?: number | null }).maxDiscount;
  if (coupon.type === 'PERCENT' && cap != null && cap > 0) raw = Math.min(raw, cap);
  const discount = Math.min(raw, subtotal);
  return { couponId: coupon.id, discount };
}

export async function validateCouponForDisplay(code: string, subtotal: number, ctx: CouponContext = {}) {
  const { couponId, discount } = await resolveCoupon(code, subtotal, prisma, ctx);
  if (!couponId) throw new AppError(400, 'Coupon does not exist');
  const coupon = await prisma.coupon.findUnique({ where: { id: couponId } });
  // resolveCoupon already validated everything; the re-read is only for display fields.
  if (!coupon) throw new AppError(400, 'Coupon does not exist');
  return { coupon, discount };
}
