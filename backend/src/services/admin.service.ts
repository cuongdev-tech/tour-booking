import { Prisma } from '@prisma/client';
import { prisma } from '../config/env.js';
import { parseDurationDays, type ItineraryDay } from '../validators/schemas.js';
import { AppError, toSafeUser } from '../utils/helpers.js';

function slugify(title: string): string {
  return title
    .toLowerCase()
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
  const [users, tours, bookings, revenue] = await Promise.all([
    prisma.user.count(),
    prisma.tour.count(),
    prisma.booking.count({ where: { bookingStatus: { not: 'CANCELLED' } } }),
    prisma.booking.aggregate({
      where: { bookingStatus: { in: ['CONFIRMED', 'COMPLETED'] } },
      _sum: { total: true },
    }),
  ]);
  return { users, tours, bookings, revenue: revenue._sum.total ?? 0 };
}

export function adminListTours(page?: unknown, limit?: unknown) {
  const { page: p, limit: l } = pageParams(page, limit);
  return listPaged(
    (args) => prisma.tour.findMany({ ...args, orderBy: { createdAt: 'desc' } }),
    () => prisma.tour.count(),
    p,
    l,
  );
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
  minGuests: number;
  maxGuests: number;
  availableSeats: number;
  featured: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  itinerary: ItineraryDay[];
  slug?: string;
}) {
  assertItineraryMatchesDuration(data.itinerary, data.duration);
  const base = data.slug?.trim() || slugify(data.title);
  let slug = base;
  let n = 1;
  while (await prisma.tour.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return prisma.tour.create({ data: { ...data, slug, itinerary: data.itinerary as unknown as Prisma.InputJsonValue } });
}

export async function adminUpdateTour(
  id: string,
  data: Partial<Parameters<typeof adminCreateTour>[0]>,
) {
  // PATCH may send only itinerary or only duration: validate against effective values.
  if (data.itinerary !== undefined || data.duration !== undefined) {
    const current = await prisma.tour.findUnique({ where: { id } });
    if (!current) throw new AppError(404, 'Tour not found');
    assertItineraryMatchesDuration(
      data.itinerary ?? (current.itinerary as unknown),
      data.duration ?? current.duration,
    );
  }
  const { itinerary, ...rest } = data;
  return prisma.tour.update({
    where: { id },
    data: { ...rest, ...(itinerary !== undefined ? { itinerary: itinerary as unknown as Prisma.InputJsonValue } : {}) },
  });
}

export async function adminDeleteTour(id: string) {
  // Booking.tourId is RESTRICT — refuse explicitly instead of leaking a DB error.
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

export async function adminUpdateBookingStatus(id: string, status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED') {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw new AppError(404, 'Booking not found');
  if (booking.bookingStatus === status) return booking;

  return prisma.$transaction(async (tx) => {
    // Re-activating a cancelled booking re-occupies seats (validated).
    if (booking.bookingStatus === 'CANCELLED' && status !== 'CANCELLED') {
      const tour = await tx.tour.findUnique({ where: { id: booking.tourId } });
      if (!tour) throw new AppError(404, 'Tour not found');
      if (booking.guests > tour.availableSeats)
        throw new AppError(400, `Only ${tour.availableSeats} seat(s) left`);
      await tx.tour.update({
        where: { id: tour.id },
        data: { availableSeats: { decrement: booking.guests } },
      });
    }
    // Cancelling restores seats and refunds captured payments (mirrors user cancel).
    if (status === 'CANCELLED' && booking.bookingStatus !== 'CANCELLED') {
      await tx.tour.update({
        where: { id: booking.tourId },
        data: { availableSeats: { increment: booking.guests } },
      });
      const payment = await tx.payment.findUnique({ where: { bookingId: id } });
      if (payment?.status === 'PAID') {
        await tx.payment.update({ where: { bookingId: id }, data: { status: 'REFUNDED' } });
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
      expiresAt: new Date(data.expiresAt),
      usageLimit: data.usageLimit ?? null,
      active: data.active,
    },
  });
}

export function adminUpdateCoupon(
  id: string,
  data: Partial<{ type: 'PERCENT' | 'FIXED'; value: number; minOrder: number; expiresAt: string; usageLimit: number | null; active: boolean }>,
) {
  return prisma.coupon.update({
    where: { id },
    data: {
      ...(data.type ? { type: data.type } : {}),
      ...(data.value !== undefined ? { value: data.value } : {}),
      ...(data.minOrder !== undefined ? { minOrder: data.minOrder } : {}),
      ...(data.expiresAt ? { expiresAt: new Date(data.expiresAt) } : {}),
      ...(data.usageLimit !== undefined ? { usageLimit: data.usageLimit } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  });
}

export function adminDeleteCoupon(id: string) {
  return prisma.coupon.delete({ where: { id } });
}
