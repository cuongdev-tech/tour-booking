import { Prisma } from '@prisma/client';
import { prisma } from '../config/env.js';
import { parseDurationDays, type ItineraryDay } from '../validators/schemas.js';
import { AppError, toSafeUser } from '../utils/helpers.js';
import { monthBounds, parseDay, vnDayStartUTC, vnMonthKey } from '../utils/revenue-time.js';
import { matchTextIds, toCalendarDay } from './tour.service.js';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[đ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 100);
}

function pageParams(page?: unknown, limit?: unknown): { page: number; limit: number } {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const l = Math.min(50, Math.max(1, Math.floor(Number(limit) || 10)));
  return { page: p, limit: l };
}

async function listPaged<T>(
  find: (args: { skip: number; take: number }) => Promise<T[]>,
  count: () => Promise<number>,
  page: number,
  limit: number,
) {
  const [total, data] = await Promise.all([count(), find({ skip: (page - 1) * limit, take: limit })]);
  return { data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function getStats() {
  // Chart window: first day of the month 5 months ago (6 zero-filled buckets).
  const now = new Date();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const [users, tours, bookings, revenue, byStatus, paidRecent] = await Promise.all([
    prisma.user.count(),
    prisma.tour.count(),
    prisma.booking.count(),
    // Real collected money only: captured payments, not booking totals.
    prisma.payment.aggregate({
      where: { status: 'PAID' },
      _sum: { amount: true },
    }),
    prisma.booking.groupBy({ by: ['bookingStatus'], _count: { bookingStatus: true } }),
    // Bounded to the displayed window (legacy rows get paidAt from the
    // backfill migration, so totals and months stay consistent).
    prisma.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: windowStart } },
      select: { amount: true, paidAt: true },
      orderBy: { paidAt: 'asc' },
    }),
  ]);
  // Last 6 calendar months, zero-filled — months without revenue report 0.
  const months: Array<{ key: string; label: string; total: number }> = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`, total: 0 });
  }
  const byMonth = new Map(months.map((m) => [m.key, m]));
  for (const p of paidRecent) {
    if (!p.paidAt) continue;
    const key = `${p.paidAt.getUTCFullYear()}-${String(p.paidAt.getUTCMonth() + 1).padStart(2, '0')}`;
    const bucket = byMonth.get(key);
    if (bucket) bucket.total += p.amount;
  }
  return {
    users,
    tours,
    bookings,
    revenue: revenue._sum.amount ?? 0,
    bookingsByStatus: byStatus.map((r) => ({ status: r.bookingStatus, count: r._count.bookingStatus })),
    revenueByMonth: months,
  };
}

export function adminListTours(page?: unknown, limit?: unknown, q?: string) {
  const { page: p, limit: l } = pageParams(page, limit);
  const run = async () => {
    let idFilter: { id: { in: string[] } } | undefined;
    if (q?.trim()) {
      const [byTitle, byDestination] = await Promise.all([
        matchTextIds('Tour', 'title', q),
        matchTextIds('Tour', 'destination', q),
      ]);
      idFilter = { id: { in: [...new Set([...byTitle, ...byDestination])] } };
    }
    return listPaged(
      (args) => prisma.tour.findMany({ ...args, where: idFilter, orderBy: { createdAt: 'desc' } }),
      () => prisma.tour.count({ where: idFilter }),
      p,
      l,
    );
  };
  return run();
}

/** Itinerary day-count must match the tour duration (e.g. "3 ngày 2 đêm" -> 3 days). */
function assertItineraryMatchesDuration(itinerary: unknown, duration: string): void {
  if (!Array.isArray(itinerary)) throw new AppError(400, 'Itinerary must be an array');
  const expected = parseDurationDays(duration);
  if (expected !== null && itinerary.length !== expected) {
    throw new AppError(400, `Itinerary has ${itinerary.length} day(s) but duration "${duration}" expects ${expected}`);
  }
}

export async function adminCreateTour(data: {
  title: string;
  description: string;
  category: 'Beach' | 'Mountains' | 'Culture' | 'Relaxation';
  departureLocation: string;
  destination: string;
  transportation: string[];
  includedServices: string[];
  excludedServices: string[];
  images: string[];
  duration: string;
  price: number;
  childPrice?: number | null;
  childMaxAge?: number | null;
  addons?: import('../validators/schemas.js').TourAddon[];
  freeCancelHours?: number | null;
  minGuests: number;
  maxGuests: number;
  availableSeats: number;
  featured: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  itinerary: ItineraryDay[];
  slug?: string;
}) {
  assertItineraryMatchesDuration(data.itinerary, data.duration);
  assertTourPricing(data.price, data.childPrice ?? null, data.childMaxAge ?? null);
  const base = data.slug?.trim() || slugify(data.title);
  let slug = base;
  let n = 1;
  while (await prisma.tour.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  const { addons, ...rest } = data;
  return prisma.tour.create({
    data: {
      ...rest,
      slug,
      itinerary: data.itinerary as unknown as Prisma.InputJsonValue,
      ...(addons !== undefined ? { addons: addons as unknown as Prisma.InputJsonValue } : {}),
    },
  });
}

/** childPrice must stay below the effective adult price; age needs a price. */
function assertTourPricing(price: number, childPrice: number | null, childMaxAge: number | null): void {
  if (childPrice != null && childPrice >= price) {
    throw new AppError(400, `childPrice (${childPrice}) must be lower than price (${price})`);
  }
  if (childMaxAge != null && childPrice == null) {
    throw new AppError(400, 'childMaxAge requires childPrice to be set');
  }
}

export async function adminUpdateTour(
  id: string,
  data: Partial<Parameters<typeof adminCreateTour>[0]>,
) {
  // PATCH may send only itinerary or only duration: validate against effective values.
  // Same for minGuests/maxGuests and price/childPrice: a partial update must not
  // invert ranges or leave an age without a price.
  if (
    data.itinerary !== undefined ||
    data.duration !== undefined ||
    data.minGuests !== undefined ||
    data.maxGuests !== undefined ||
    data.price !== undefined ||
    data.childPrice !== undefined ||
    data.childMaxAge !== undefined
  ) {
    const current = await prisma.tour.findUnique({ where: { id } });
    if (!current) throw new AppError(404, 'Tour not found');
    assertItineraryMatchesDuration(
      data.itinerary ?? (current.itinerary as unknown),
      data.duration ?? current.duration,
    );
    const effectiveMin = data.minGuests ?? current.minGuests;
    const effectiveMax = data.maxGuests ?? current.maxGuests;
    if (effectiveMax < effectiveMin) {
      throw new AppError(400, `maxGuests (${effectiveMax}) must be >= minGuests (${effectiveMin})`);
    }
    assertTourPricing(
      data.price ?? current.price,
      data.childPrice !== undefined ? data.childPrice : current.childPrice,
      data.childMaxAge !== undefined ? data.childMaxAge : current.childMaxAge,
    );
  }
  const { itinerary, addons, ...rest } = data;
  return prisma.tour.update({
    where: { id },
    data: {
      ...rest,
      ...(itinerary !== undefined ? { itinerary: itinerary as unknown as Prisma.InputJsonValue } : {}),
      ...(addons !== undefined ? { addons: addons as unknown as Prisma.InputJsonValue } : {}),
    },
  });
}

export async function adminDeleteTour(id: string) {
  // Booking.tourId is RESTRICT — any booking row (including CANCELLED history)
  // still blocks deletion at the DB level, so refuse explicitly with a clean
  // 400 instead of leaking a Prisma error.
  const used = await prisma.booking.count({ where: { tourId: id } });
  if (used > 0) throw new AppError(400, 'Cannot delete tour with existing bookings');
  return prisma.tour.delete({ where: { id } });
}

export function adminListBookings(status?: string, page?: unknown, limit?: unknown) {
  const { page: p, limit: l } = pageParams(page, limit);
  const where = status ? { bookingStatus: status as 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' } : {};
  return listPaged(
    (args) =>
      prisma.booking.findMany({
        ...args,
        where,
        include: { tour: true, user: { select: { id: true, name: true, email: true } }, payment: true },
        orderBy: { createdAt: 'desc' },
      }),
    () => prisma.booking.count({ where }),
    p,
    l,
  );
}

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

/**
 * Allowed status transitions (the same machine the frontend dropdown mirrors).
 * COMPLETED is terminal; CANCELLED can only be re-activated to CONFIRMED.
 */
const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PENDING', 'COMPLETED', 'CANCELLED'],
  CANCELLED: ['CONFIRMED'],
  COMPLETED: [],
};

export function adminGetBooking(id: string) {
  return prisma.booking.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      tour: true,
      guestsList: true,
      payment: true,
      coupon: true,
    },
  }).then((booking) => {
    if (!booking) throw new AppError(404, 'Booking not found');
    return booking;
  });
}

type PaymentStatus = 'PENDING' | 'AWAITING_CONFIRMATION' | 'PAID' | 'FAILED' | 'REFUNDED';

/** Money moves forward only: PENDING→PAID/FAILED, customer-reported transfers
 * (AWAITING_CONFIRMATION)→PAID/FAILED after statement check, FAILED→PENDING
 * (retry). PAID is terminal here (refunds happen exclusively through
 * cancellation), and so is REFUNDED. */
const ALLOWED_PAYMENT_TRANSITIONS: Record<PaymentStatus, Array<'PENDING' | 'PAID' | 'FAILED'>> = {
  PENDING: ['PAID', 'FAILED'],
  AWAITING_CONFIRMATION: ['PAID', 'FAILED'],
  FAILED: ['PENDING'],
  PAID: [],
  REFUNDED: [],
};

export async function adminUpdatePaymentStatus(bookingId: string, status: 'PENDING' | 'PAID' | 'FAILED') {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });
  if (!booking) throw new AppError(404, 'Booking not found');
  if (!booking.payment) throw new AppError(400, 'Booking has no payment');
  const current = booking.payment.status as PaymentStatus;
  if (current === status) return booking.payment;
  // A cancelled booking must never capture money (refunds go through cancel).
  if (booking.bookingStatus === 'CANCELLED' && status === 'PAID') {
    throw new AppError(400, 'Cancelled booking cannot be paid');
  }
  if (!ALLOWED_PAYMENT_TRANSITIONS[current].includes(status)) {
    throw new AppError(400, 'Invalid payment status transition');
  }
  return prisma.payment.update({
    where: { bookingId },
    data: { status, paidAt: status === 'PAID' ? new Date() : null },
  });
}

/**
 * Admin bell feed: bank transfers the customer reported, awaiting statement
 * verification. Inherently "unread until handled" — rows disappear once the
 * admin captures (PAID) or rejects (FAILED), so no seen-state is needed.
 */
export async function adminAwaitingPayments() {
  const where = {
    bookingStatus: { notIn: ['CANCELLED', 'COMPLETED'] as BookingStatus[] },
    payment: { status: 'AWAITING_CONFIRMATION' as const },
  };
  const [data, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        tour: { select: { id: true, title: true } },
        user: { select: { id: true, name: true, email: true } },
        payment: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    prisma.booking.count({ where }),
  ]);
  return { data, total };
}

export async function adminUpdateBookingStatus(id: string, status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED') {  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw new AppError(404, 'Booking not found');
  if (booking.bookingStatus === status) return booking;
  if (!ALLOWED_TRANSITIONS[booking.bookingStatus as BookingStatus].includes(status)) {
    throw new AppError(400, 'Invalid status transition');
  }
  // A tour that has not taken place yet can never be COMPLETED (this is also
  // what guarantees reviews only exist for finished trips).
  if (status === 'COMPLETED' && booking.travelDate.getTime() > Date.now()) {
    throw new AppError(400, 'Tour has not taken place yet');
  }

  return prisma.$transaction(async (tx) => {
    // Re-activating a cancelled booking re-occupies seats (validated) and
    // re-consumes coupon quota + per-date inventory (mirrors cancel inverse).
    if (booking.bookingStatus === 'CANCELLED' && status !== 'CANCELLED') {
      await tx.$queryRaw`SELECT "id" FROM "Tour" WHERE "id" = ${booking.tourId} FOR UPDATE`;
      const tour = await tx.tour.findUnique({ where: { id: booking.tourId } });
      if (!tour) throw new AppError(404, 'Tour not found');
      if (tour.status !== 'ACTIVE') throw new AppError(400, 'Tour is no longer available');
      if (booking.guests > tour.availableSeats)
        throw new AppError(400, `Only ${tour.availableSeats} seat(s) left`);
      const day = toCalendarDay(booking.travelDate);
      await tx.$queryRaw`SELECT "id" FROM "TourDate" WHERE "tourId" = ${booking.tourId} AND "date" = ${day} FOR UPDATE`;
      const dateRow = await tx.tourDate.findUnique({
        where: { tourId_date: { tourId: booking.tourId, date: day } },
      });
      if (dateRow && dateRow.booked + booking.guests > dateRow.capacity) {
        throw new AppError(400, 'This date is sold out');
      }
      await tx.tour.update({
        where: { id: tour.id },
        data: { availableSeats: { decrement: booking.guests } },
      });
      if (dateRow) {
        await tx.tourDate.update({
          where: { id: dateRow.id },
          data: { booked: { increment: booking.guests } },
        });
      }
      if (booking.couponId) {
        await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "id" = ${booking.couponId} FOR UPDATE`;
        const coupon = await tx.coupon.findUnique({ where: { id: booking.couponId } });
        if (coupon) {
          if (!coupon.active || coupon.expiresAt.getTime() < Date.now()) {
            throw new AppError(400, 'Coupon is no longer valid');
          }
          if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
            throw new AppError(400, 'Coupon usage limit exceeded');
          }
          await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
        }
      }
      const payment = await tx.payment.findUnique({ where: { bookingId: id } });
      // A refund issued at cancel time must not stay REFUNDED on a live booking:
      // move it back to PENDING so it can be captured again.
      if (payment?.status === 'REFUNDED') {
        await tx.payment.update({ where: { bookingId: id }, data: { status: 'PENDING', paidAt: null } });
      }
    }
    // Cancelling an upcoming booking restores seats (global + per-date bucket),
    // refunds captured payments and returns coupon quota (mirrors user cancel).
    // A COMPLETED tour already happened, so its seats must not be released back
    // into inventory.
    if (status === 'CANCELLED' && (booking.bookingStatus === 'PENDING' || booking.bookingStatus === 'CONFIRMED')) {
      // Same locks as the customer cancel path: serialize against concurrent
      // creates/cancels touching seats, per-date buckets or coupon quota.
      const cancelDay = toCalendarDay(booking.travelDate);
      await tx.$queryRaw`SELECT "id" FROM "Tour" WHERE "id" = ${booking.tourId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "TourDate" WHERE "tourId" = ${booking.tourId} AND "date" = ${cancelDay} FOR UPDATE`;
      if (booking.couponId) {
        await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "id" = ${booking.couponId} FOR UPDATE`;
      }
      await tx.tour.update({
        where: { id: booking.tourId },
        data: { availableSeats: { increment: booking.guests } },
      });
      const cancelRow = await tx.tourDate.findUnique({
        where: { tourId_date: { tourId: booking.tourId, date: cancelDay } },
      });
      if (cancelRow && cancelRow.booked > 0) {
        await tx.tourDate.update({
          where: { id: cancelRow.id },
          data: { booked: Math.max(0, cancelRow.booked - booking.guests) },
        });
      }
      const payment = await tx.payment.findUnique({ where: { bookingId: id } });
      if (payment?.status === 'PAID') {
        await tx.payment.update({ where: { bookingId: id }, data: { status: 'REFUNDED' } });
      } else if (payment?.status === 'AWAITING_CONFIRMATION') {
        // Reported but never verified: nothing captured, back to PENDING.
        await tx.payment.update({ where: { bookingId: id }, data: { status: 'PENDING' } });
      }
      if (booking.couponId) {
        await tx.coupon.updateMany({
          where: { id: booking.couponId, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        });
      }
    }
    return tx.booking.update({ where: { id }, data: { bookingStatus: status } });
  });
}

export async function adminListUsers(page?: unknown, limit?: unknown) {
  const { page: p, limit: l } = pageParams(page, limit);
  const result = await listPaged(
    (args) => prisma.user.findMany({ ...args, orderBy: { createdAt: 'desc' } }),
    () => prisma.user.count(),
    p,
    l,
  );
  return { ...result, data: result.data.map(toSafeUser) };
}

export async function adminUpdateUser(id: string, data: { role?: 'CUSTOMER' | 'ADMIN'; status?: 'ACTIVE' | 'INACTIVE' }) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AppError(404, 'User not found');
  // The controller blocks self role/status changes, but a second admin (or a
  // future route) could still remove the last active admin — after which nobody
  // can administrate. Guard at the service level so it holds for every caller.
  const demoting = target.role === 'ADMIN' && data.role !== undefined && data.role !== 'ADMIN';
  const disabling = target.status === 'ACTIVE' && data.status !== undefined && data.status !== 'ACTIVE';
  if (demoting || disabling) {
    const others = await prisma.user.count({
      where: { id: { not: id }, role: 'ADMIN', status: 'ACTIVE' },
    });
    if (others === 0) throw new AppError(400, 'Cannot remove the last active admin');
  }
  const user = await prisma.user.update({ where: { id }, data });
  return toSafeUser(user);
}

export function adminListCoupons(page?: unknown, limit?: unknown) {
  const { page: p, limit: l } = pageParams(page, limit);
  return listPaged(
    (args) => prisma.coupon.findMany({ ...args, orderBy: { createdAt: 'desc' } }),
    () => prisma.coupon.count(),
    p,
    l,
  );
}

function parseExpiry(input: string): Date {
  const d = new Date(input);
  // A date-only input (YYYY-MM-DD, as sent by <input type="date">) means the coupon
  // stays valid through that day — not expired at midnight when the day starts.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) d.setUTCHours(23, 59, 59, 999);
  return d;
}

export function adminCreateCoupon(data: {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minOrder: number;
  expiresAt: string;
  usageLimit?: number | null;
  active: boolean;
}) {
  return prisma.coupon.create({
    data: {
      code: data.code.trim().toUpperCase(),
      type: data.type,
      value: data.value,
      minOrder: data.minOrder,
      expiresAt: parseExpiry(data.expiresAt),
      usageLimit: data.usageLimit ?? null,
      active: data.active,
    },
  });
}

export async function adminUpdateCoupon(
  id: string,
  data: Partial<{ type: 'PERCENT' | 'FIXED'; value: number; minOrder: number; expiresAt: string; usageLimit: number | null; active: boolean }>,
) {
  // The zod patch schema only sees the fields being patched, so it cannot
  // catch { value: 150 } on an existing PERCENT coupon (a >100% percent is
  // capped at free). Resolve the effective type against the stored row.
  if (data.value !== undefined || data.type !== undefined) {
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Resource not found');
    const effectiveType = data.type ?? existing.type;
    const effectiveValue = data.value ?? existing.value;
    if (effectiveType === 'PERCENT' && (effectiveValue < 1 || effectiveValue > 100)) {
      throw new AppError(400, 'Percent value must be between 1 and 100');
    }
    if (effectiveType === 'FIXED' && effectiveValue < 1) {
      throw new AppError(400, 'Coupon value must be positive');
    }
  }
  return prisma.coupon.update({
    where: { id },
    data: {
      ...(data.type ? { type: data.type } : {}),
      ...(data.value !== undefined ? { value: data.value } : {}),
      ...(data.minOrder !== undefined ? { minOrder: data.minOrder } : {}),
      ...(data.expiresAt ? { expiresAt: parseExpiry(data.expiresAt) } : {}),
      ...(data.usageLimit !== undefined ? { usageLimit: data.usageLimit } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  });
}

export function adminDeleteCoupon(id: string) {
  return prisma.coupon.delete({ where: { id } });
}

export function adminListTourDates(tourId: string) {
  return prisma.tourDate.findMany({ where: { tourId }, orderBy: { date: 'asc' } });
}

export async function adminUpsertTourDate(tourId: string, dateStr: string, capacity: number) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId } });
  if (!tour) throw new AppError(404, 'Tour not found');
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) throw new AppError(400, 'Invalid travel date');
  const day = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (day < todayUtc) throw new AppError(400, 'Invalid travel date');
  const existing = await prisma.tourDate.findUnique({ where: { tourId_date: { tourId, date: day } } });
  if (existing && capacity < existing.booked) {
    throw new AppError(400, 'Capacity cannot be below booked seats');
  }
  return prisma.tourDate.upsert({
    where: { tourId_date: { tourId, date: day } },
    create: { tourId, date: day, capacity },
    update: { capacity },
  });
}

export async function adminDeleteTourDate(id: string) {
  const row = await prisma.tourDate.findUnique({ where: { id } });
  if (!row) throw new AppError(404, 'Resource not found');
  if (row.booked > 0) {
    throw new AppError(400, 'Operation violates data constraints (record is in use)');
  }
  await prisma.tourDate.delete({ where: { id } });
  return { success: true };
}

// ---------------------------------------------------------------------------
// Doanh thu tổng quan theo tháng (màn Tổng quan kinh doanh) + báo cáo theo ngày
// (biên giờ VN nằm ở utils/revenue-time.ts để test được mà không cần DB)
// ---------------------------------------------------------------------------

/**
 * Tổng quan kinh doanh của 1 tháng:
 * - revenue: tiền thực thu (Payment PAID theo paidAt trong tháng)
 * - orders: đơn ghi nhận trong tháng (Booking tạo trong tháng, loại CANCELLED)
 * - completedOrders: đơn hoàn thành trong tháng
 * - toursActive: tour đang bán
 * - completionRate: % hoàn thành (hiệu suất shop)
 * - byCategory: doanh thu theo danh mục tour (Biển/Núi/Văn hóa/Nghỉ dưỡng)
 * - trend: xu hướng 12 tháng của năm chọn (cho biểu đồ cột)
 */
export async function getRevenueOverview(monthInput?: unknown, yearInput?: unknown) {
  const now = new Date();
  const clean = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const monthRaw = clean(monthInput) ?? now.getUTCMonth() + 1;
  const yearRaw = clean(yearInput) ?? now.getUTCFullYear();
  const safeMonth = Math.min(12, Math.max(1, Math.floor(monthRaw)));
  // Chặn năm vô lý (Date.UTC vẫn chạy nhưng query vô nghĩa + label lạ).
  const safeYear = Math.min(2100, Math.max(2000, Math.floor(yearRaw)));
  const { start, end } = monthBounds(safeMonth, safeYear);
  const yearStart = vnDayStartUTC(safeYear, 1, 1);
  const yearEnd = vnDayStartUTC(safeYear + 1, 1, 1);

  const [paidInMonth, bookingsInMonth, toursActive, paidInYear] = await Promise.all([
    prisma.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: start, lt: end } },
      select: {
        amount: true,
        paidAt: true,
        booking: { select: { id: true, tour: { select: { category: true, title: true } } } },
      },
    }),
    prisma.booking.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { id: true, total: true, guests: true, bookingStatus: true },
    }),
    prisma.tour.count({ where: { status: 'ACTIVE' } }),
    prisma.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: yearStart, lt: yearEnd } },
      select: { amount: true, paidAt: true },
    }),
  ]);

  const revenue = paidInMonth.reduce((s, p) => s + p.amount, 0);
  const validBookings = bookingsInMonth.filter((b) => b.bookingStatus !== 'CANCELLED');
  const orders = validBookings.length;
  const completedOrders = bookingsInMonth.filter((b) => b.bookingStatus === 'COMPLETED').length;
  const totalInMonth = bookingsInMonth.length;
  const completionRate = totalInMonth > 0 ? (completedOrders / totalInMonth) * 100 : 0;

  // Doanh thu theo danh mục
  const catMap = new Map<string, { category: string; total: number; count: number }>();
  for (const p of paidInMonth) {
    const cat = (p.booking?.tour?.category as string | undefined) ?? 'Unknown';
    const cur = catMap.get(cat) ?? { category: cat, total: 0, count: 0 };
    cur.total += p.amount;
    cur.count += 1;
    catMap.set(cat, cur);
  }
  const byCategory = [...catMap.values()].sort((a, b) => b.total - a.total);

  // Xu hướng 12 tháng trong năm
  const trend: Array<{ key: string; label: string; total: number; orders: number }> = [];
  for (let m = 1; m <= 12; m += 1) {
    const key = `${safeYear}-${String(m).padStart(2, '0')}`;
    trend.push({ key, label: `Tháng ${m}`, total: 0, orders: 0 });
  }
  const trendByKey = new Map(trend.map((t) => [t.key, t]));
  for (const p of paidInYear) {
    if (!p.paidAt) continue;
    // Xếp theo tháng VN hiển thị (không phải tháng UTC) để khớp cửa sổ VN.
    const bucket = trendByKey.get(vnMonthKey(p.paidAt));
    if (bucket) {
      bucket.total += p.amount;
      bucket.orders += 1;
    }
  }

  return {
    month: safeMonth,
    year: safeYear,
    revenue,
    orders,
    completedOrders,
    totalInMonth,
    toursActive,
    completionRate: Math.round(completionRate * 10) / 10,
    byCategory,
    trend,
  };
}

/**
 * Báo cáo doanh thu theo ngày (màn Lịch sử giao dịch):
 * - goodsTotal: tiền hàng trong ngày (tổng Booking tạo trong ngày, loại đơn hủy)
 * - collectedTotal: thực thu trong ngày (Payment PAID theo paidAt)
 * - guests: tổng số khách trong ngày
 * - completedOrders: số đơn PAID trong ngày
 * - transactions: chi tiết từng giao dịch (mã GD, thời gian, nội dung, loại, số tiền, trạng thái)
 */
export async function getRevenueDaily(dateInput?: unknown) {
  const day = parseDay(dateInput);
  if (!day) throw new AppError(400, 'Invalid date');
  const { start, end, label } = day;

  const [bookings, payments] = await Promise.all([
    prisma.booking.findMany({
      where: { createdAt: { gte: start, lt: end } },
      include: {
        tour: { select: { id: true, title: true } },
        payment: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payment.findMany({
      where: { paidAt: { gte: start, lt: end } },
      include: {
        booking: {
          include: {
            tour: { select: { id: true, title: true } },
            user: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
    }),
  ]);

  const validBookings = bookings.filter((b) => b.bookingStatus !== 'CANCELLED');
  const goodsTotal = validBookings.reduce((s, b) => s + b.total, 0);
  const paidOnly = payments.filter((p) => p.status === 'PAID');
  const collectedTotal = paidOnly.reduce((s, p) => s + p.amount, 0);
  const guests = validBookings.reduce((s, b) => s + b.guests, 0);

  const transactions = payments.map((p) => ({
    id: p.transactionCode ?? p.id,
    bookingId: p.bookingId,
    bookingCode: p.booking?.bookingCode ?? '',
    time: p.paidAt ?? p.updatedAt,
    tourTitle: p.booking?.tour?.title ?? '',
    customerName: p.booking?.user?.name ?? p.booking?.customerName ?? '',
    customerEmail: p.booking?.customerEmail ?? '',
    method: p.method,
    amount: p.amount,
    status: p.status,
  }));

  return {
    date: label,
    goodsTotal,
    collectedTotal,
    guests,
    totalBookings: validBookings.length,
    completedOrders: paidOnly.length,
    transactions,
  };
}
