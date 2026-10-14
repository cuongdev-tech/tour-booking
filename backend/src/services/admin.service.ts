import { Prisma } from '@prisma/client';
import { prisma } from '../config/env.js';
import { parseDurationDays, type ItineraryDay } from '../validators/schemas.js';
import { AppError, toSafeUser } from '../utils/helpers.js';
import { monthBounds, parseDay, vnDayStartUTC } from '../utils/revenue-time.js';
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
  priceTiers?: Array<{ minGuests: number; price: number; childPrice?: number }>;
  privateAvailable?: boolean;
  privateSurcharge?: number;
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
  assertPriceTiers(data.priceTiers);
  if (data.privateSurcharge != null && data.privateSurcharge < 0) {
    throw new AppError(400, 'Private surcharge must be a non-negative integer');
  }
  const base = data.slug?.trim() || slugify(data.title);
  const { addons, ...rest } = data;
  // Slug race: two admins with the same title could pass the findUnique check
  // together — retry with suffix on P2002 instead of leaking a raw 409.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    // Re-check base occupancy each attempt (first attempt keeps exact base).
    let slug = `${base}${suffix}`;
    if (attempt > 0) {
      let n = attempt + 1;
      while (await prisma.tour.findUnique({ where: { slug } })) {
        n += 1;
        slug = `${base}-${n}`;
      }
    } else {
      let n = 1;
      let s = base;
      while (await prisma.tour.findUnique({ where: { slug: s } })) {
        n += 1;
        s = `${base}-${n}`;
      }
      slug = s;
    }
    try {
      return await prisma.tour.create({
        data: {
          ...rest,
          slug,
          itinerary: data.itinerary as unknown as Prisma.InputJsonValue,
          ...(addons !== undefined ? { addons: addons as unknown as Prisma.InputJsonValue } : {}),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        Array.isArray(err.meta?.target) &&
        (err.meta.target as string[]).includes('slug') &&
        attempt < 2
      ) {
        continue;
      }
      throw err;
    }
  }
  throw new AppError(409, 'Resource already exists');
}

/** Tier sanity: ascending unique minGuests, tier childPrice below tier price. */
function assertPriceTiers(tiers: Array<{ minGuests: number; price: number; childPrice?: number }> | undefined): void {
  if (!tiers || tiers.length === 0) return;
  const seen = new Set<number>();
  let prev = 0;
  for (const t of tiers) {
    if (seen.has(t.minGuests)) throw new AppError(400, 'Price tiers must have unique guest thresholds');
    seen.add(t.minGuests);
    if (t.minGuests <= prev) throw new AppError(400, 'Price tiers must be ascending by guests');
    prev = t.minGuests;
    if (t.childPrice != null && t.childPrice >= t.price) {
      throw new AppError(400, 'Tier childPrice must be lower than tier price');
    }
  }
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
    data.childMaxAge !== undefined ||
    data.slug !== undefined ||
    data.availableSeats !== undefined ||
    data.status !== undefined ||
    data.priceTiers !== undefined ||
    data.privateAvailable !== undefined ||
    data.privateSurcharge !== undefined
  ) {
    const current = await prisma.tour.findUnique({ where: { id } });
    if (!current) throw new AppError(404, 'Tour not found');
    if (data.privateSurcharge !== undefined) {
      if (!Number.isInteger(data.privateSurcharge) || data.privateSurcharge < 0) {
        throw new AppError(400, 'Private surcharge must be a non-negative integer');
      }
    }
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
    // Slug must stay unique (create path auto-suffixes; patch must not 409 raw).
    if (data.slug !== undefined) {
      const slug = data.slug.trim();
      if (!slug) throw new AppError(400, 'Slug must not be empty');
      const clash = await prisma.tour.findUnique({ where: { slug } });
      if (clash && clash.id !== id) throw new AppError(409, 'Resource already exists');
      data = { ...data, slug };
    }
    // availableSeats is remaining inventory — never negative.
    const effectiveSeats = data.availableSeats ?? current.availableSeats;
    if (!Number.isInteger(effectiveSeats) || effectiveSeats < 0) {
      throw new AppError(400, 'Available seats must be a non-negative integer');
    }
    // Guard against breaking live bookings: upcoming PENDING/CONFIRMED orders.
    const needsBookingCheck =
      data.maxGuests !== undefined || data.minGuests !== undefined || data.status !== undefined;
    if (needsBookingCheck) {
      const now = new Date();
      const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const upcoming = await prisma.booking.findMany({
        where: {
          tourId: id,
          bookingStatus: { in: ['PENDING', 'CONFIRMED'] },
          travelDate: { gte: todayUtc },
        },
        select: { guests: true },
      });
      if (upcoming.length > 0) {
        const maxBooked = Math.max(...upcoming.map((b) => b.guests));
        const minBooked = Math.min(...upcoming.map((b) => b.guests));
        if (effectiveMax < maxBooked) {
          throw new AppError(
            400,
            `Tour allows at most ${effectiveMax} guest(s) but ${upcoming.length} upcoming booking(s) have up to ${maxBooked} guest(s)`,
          );
        }
        if (effectiveMin > minBooked) {
          throw new AppError(
            400,
            `Tour requires at least ${effectiveMin} guest(s) but ${upcoming.length} upcoming booking(s) have as few as ${minBooked} guest(s)`,
          );
        }
        if (data.status === 'INACTIVE') {
          throw new AppError(400, 'Cannot hide a tour with upcoming bookings — cancel them first');
        }
      }
    }
  }
  const { itinerary, addons, priceTiers, ...rest } = data;
  if (priceTiers !== undefined) assertPriceTiers(priceTiers);
  return prisma.tour.update({
    where: { id },
    data: {
      ...rest,
      ...(itinerary !== undefined ? { itinerary: itinerary as unknown as Prisma.InputJsonValue } : {}),
      ...(addons !== undefined ? { addons: addons as unknown as Prisma.InputJsonValue } : {}),
      ...(priceTiers !== undefined ? { priceTiers: priceTiers as unknown as Prisma.InputJsonValue } : {}),
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
  const valid: Array<'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'> = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'];
  if (status && !(valid as string[]).includes(status)) {
    throw new AppError(400, `Invalid status. Valid values: ${valid.join(', ')}`);
  }
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
 * (AWAITING_CONFIRMATION)→PAID/FAILED after statement check, or →PENDING when
 * the customer mis-clicked "transferred" (nothing captured, back to pending).
 * FAILED→PENDING (retry). PAID is terminal here (refunds happen exclusively through
 * cancellation), and so is REFUNDED. */
const ALLOWED_PAYMENT_TRANSITIONS: Record<PaymentStatus, Array<'PENDING' | 'PAID' | 'FAILED'>> = {
  PENDING: ['PAID', 'FAILED'],
  AWAITING_CONFIRMATION: ['PAID', 'FAILED', 'PENDING'],
  FAILED: ['PENDING'],
  PAID: [],
  REFUNDED: [],
};

export async function adminUpdatePaymentStatus(bookingId: string, status: 'PENDING' | 'PAID' | 'FAILED') {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true },
    });
    if (!booking) throw new AppError(404, 'Booking not found');
    if (!booking.payment) throw new AppError(400, 'Booking has no payment');
    const current = booking.payment.status as PaymentStatus;
    if (current === status) return booking.payment;
    // Completed bookings are immutable history — money must not move.
    if (booking.bookingStatus === 'COMPLETED') throw new AppError(400, 'Completed booking cannot be modified');
    // A cancelled booking must never capture money (refunds go through cancel).
    if (booking.bookingStatus === 'CANCELLED' && status === 'PAID') {
      throw new AppError(400, 'Cancelled booking cannot be paid');
    }
    if (!ALLOWED_PAYMENT_TRANSITIONS[current].includes(status)) {
      throw new AppError(400, 'Invalid payment status transition');
    }
    const pay = await tx.payment.update({
      where: { bookingId },
      data: { status, paidAt: status === 'PAID' ? new Date() : null },
    });
    if (status === 'PAID') {
      await tx.booking.update({ where: { id: bookingId }, data: { holdExpiresAt: null } });
    }
    return pay;
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
  // Compare calendar days in UTC (same as booking creation) so a tour today
  // can be completed, but a future date can never be.
  // Money guard: only PAID bookings complete — revenue (PAID-only) must match
  // completedOrders, otherwise reports drift. CASH is no exception: mark PAID
  // when cash is received, then COMPLETED.
  // Re-activation guard: a cancelled tour that already started can never go
  // back to CONFIRMED (would corrupt seats/coupon quota on a past trip).
  if (status === 'COMPLETED' || (booking.bookingStatus === 'CANCELLED' && status === 'CONFIRMED')) {
    const travelDay = Date.UTC(
      booking.travelDate.getUTCFullYear(),
      booking.travelDate.getUTCMonth(),
      booking.travelDate.getUTCDate(),
    );
    const n = new Date();
    const todayUtc = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    if (status === 'COMPLETED' && travelDay > todayUtc) throw new AppError(400, 'Tour has not taken place yet');
    if (status === 'CONFIRMED' && travelDay < todayUtc)
      throw new AppError(400, 'Cannot re-activate a tour that already started');
    if (status === 'COMPLETED') {
      const pay = await prisma.payment.findUnique({ where: { bookingId: id } });
      if (!pay || pay.status !== 'PAID') throw new AppError(400, 'Only paid bookings can be completed');
    }
  }

  return prisma.$transaction(async (tx) => {
    // Serialize concurrent admin/user cancels: lock the booking row first and
    // re-validate the transition inside the tx (the pre-check can't prevent a race).
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${id} FOR UPDATE`;
    const fresh = await tx.booking.findUnique({ where: { id } });
    if (!fresh) throw new AppError(404, 'Booking not found');
    if (fresh.bookingStatus === status) return fresh;
    if (!ALLOWED_TRANSITIONS[fresh.bookingStatus as BookingStatus].includes(status)) {
      throw new AppError(400, 'Invalid status transition');
    }
    if (status === 'COMPLETED') {
      const pay = await tx.payment.findUnique({ where: { bookingId: id } });
      if (!pay || pay.status !== 'PAID') throw new AppError(400, 'Only paid bookings can be completed');
    }
    if (fresh.bookingStatus === 'CANCELLED' && status === 'CONFIRMED') {
      const day = fresh.travelDate;
      const travelDay = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
      const n = new Date();
      const todayUtc = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
      if (travelDay < todayUtc) throw new AppError(400, 'Cannot re-activate a tour that already started');
    }
    // Re-activating a cancelled booking re-occupies seats (validated) and
    // re-consumes coupon quota + per-date inventory (mirrors cancel inverse).
    // Use fresh (locked) row throughout — the outer `booking` may be stale.
    if (fresh.bookingStatus === 'CANCELLED' && status !== 'CANCELLED') {
      await tx.$queryRaw`SELECT "id" FROM "Tour" WHERE "id" = ${fresh.tourId} FOR UPDATE`;
      const tour = await tx.tour.findUnique({ where: { id: fresh.tourId } });
      if (!tour) throw new AppError(404, 'Tour not found');
      if (tour.status !== 'ACTIVE') throw new AppError(400, 'Tour is no longer available');
      if (fresh.guests > tour.availableSeats)
        throw new AppError(400, `Only ${tour.availableSeats} seat(s) left`);
      const day = toCalendarDay(fresh.travelDate);
      await tx.$queryRaw`SELECT "id" FROM "TourDate" WHERE "tourId" = ${fresh.tourId} AND "date" = ${day} FOR UPDATE`;
      const dateRow = await tx.tourDate.findUnique({
        where: { tourId_date: { tourId: fresh.tourId, date: day } },
      });
      if (dateRow && dateRow.booked + fresh.guests > dateRow.capacity) {
        throw new AppError(400, 'This date is sold out');
      }
      await tx.tour.update({
        where: { id: tour.id },
        data: { availableSeats: { decrement: fresh.guests } },
      });
      if (dateRow) {
        await tx.tourDate.update({
          where: { id: dateRow.id },
          data: { booked: { increment: fresh.guests } },
        });
      }
      if (fresh.couponId) {
        await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "id" = ${fresh.couponId} FOR UPDATE`;
        const coupon = await tx.coupon.findUnique({ where: { id: fresh.couponId } });
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
    if (status === 'CANCELLED' && (fresh.bookingStatus === 'PENDING' || fresh.bookingStatus === 'CONFIRMED')) {
      // Same locks as the customer cancel path: serialize against concurrent
      // creates/cancels touching seats, per-date buckets or coupon quota.
      const cancelDay = toCalendarDay(fresh.travelDate);
      await tx.$queryRaw`SELECT "id" FROM "Tour" WHERE "id" = ${fresh.tourId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "TourDate" WHERE "tourId" = ${fresh.tourId} AND "date" = ${cancelDay} FOR UPDATE`;
      if (fresh.couponId) {
        await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "id" = ${fresh.couponId} FOR UPDATE`;
      }
      await tx.tour.update({
        where: { id: fresh.tourId },
        data: { availableSeats: { increment: fresh.guests } },
      });
      const cancelRow = await tx.tourDate.findUnique({
        where: { tourId_date: { tourId: fresh.tourId, date: cancelDay } },
      });
      if (cancelRow && cancelRow.booked > 0) {
        await tx.tourDate.update({
          where: { id: cancelRow.id },
          data: { booked: Math.max(0, cancelRow.booked - fresh.guests) },
        });
      }
      const payment = await tx.payment.findUnique({ where: { bookingId: id } });
      if (payment?.status === 'PAID') {
        await tx.payment.update({ where: { bookingId: id }, data: { status: 'REFUNDED' } });
      } else if (payment?.status === 'AWAITING_CONFIRMATION') {
        // Reported but never verified: nothing captured, back to PENDING.
        await tx.payment.update({ where: { bookingId: id }, data: { status: 'PENDING' } });
      }
      if (fresh.couponId) {
        await tx.coupon.updateMany({
          where: { id: fresh.couponId, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        });
      }
      if (fresh.loyaltyUsed > 0) {
        await tx.user.update({ where: { id: fresh.userId }, data: { loyaltyPoints: { increment: fresh.loyaltyUsed } } });
        await tx.loyaltyTransaction.create({
          data: { userId: fresh.userId, points: fresh.loyaltyUsed, type: 'REFUND', bookingId: id },
        });
      }
    }
    const result = await tx.booking.update({
      where: { id },
      data: {
        bookingStatus: status,
        ...(status === 'CANCELLED'
          ? { cancelReason: 'ADMIN', holdExpiresAt: null }
          : status === 'CONFIRMED' && fresh.bookingStatus === 'CANCELLED'
            ? { cancelReason: null }
            : {}),
      },
    });
    // Earn loyalty on completion: 1 point per 10.000₫ (idempotent per booking).
    if (status === 'COMPLETED') {
      const { EARN_RATE_VND } = await import('./loyalty.service.js');
      const done = await tx.booking.findUnique({ where: { id }, select: { total: true, userId: true } });
      if (done) {
        const earned = Math.floor(done.total / EARN_RATE_VND);
        if (earned > 0) {
          const already = await tx.loyaltyTransaction.findFirst({
            where: { bookingId: id, type: 'EARN' },
          });
          if (!already) {
            await tx.user.update({ where: { id: done.userId }, data: { loyaltyPoints: { increment: earned } } });
            await tx.loyaltyTransaction.create({
              data: { userId: done.userId, points: earned, type: 'EARN', bookingId: id },
            });
          }
        }
      }
    }
    return result;
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
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...data,
      // Role/status change must revoke existing sessions immediately.
      ...(demoting || disabling ? { tokenVersion: { increment: 1 } } : {}),
    },
  });
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
  applicableTourIds?: string[];
  applicableCategory?: 'Beach' | 'Mountains' | 'Culture' | 'Relaxation' | null;
  startsAt?: string | null;
  maxDiscount?: number | null;
  minGuests?: number;
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
      applicableTourIds: (data.applicableTourIds ?? []) as unknown as Prisma.InputJsonValue,
      applicableCategory: data.applicableCategory ?? null,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      maxDiscount: data.maxDiscount ?? null,
      minGuests: data.minGuests ?? 0,
    },
  });
}

export async function adminUpdateCoupon(
  id: string,
  data: Partial<{ type: 'PERCENT' | 'FIXED'; value: number; minOrder: number; expiresAt: string; usageLimit: number | null; active: boolean; applicableTourIds: string[]; applicableCategory: 'Beach' | 'Mountains' | 'Culture' | 'Relaxation' | null; startsAt: string | null; maxDiscount: number | null; minGuests: number }>,
) {
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Resource not found');
  // The zod patch schema only sees the fields being patched, so it cannot
  // catch { value: 150 } on an existing PERCENT coupon (a >100% percent is
  // capped at free). Resolve the effective type against the stored row.
  if (data.value !== undefined || data.type !== undefined) {
    const effectiveType = data.type ?? existing.type;
    const effectiveValue = data.value ?? existing.value;
    if (effectiveType === 'PERCENT' && (effectiveValue < 1 || effectiveValue > 100)) {
      throw new AppError(400, 'Percent value must be between 1 and 100');
    }
    if (effectiveType === 'FIXED' && effectiveValue < 1) {
      throw new AppError(400, 'Coupon value must be positive');
    }
  }
  // Cross-field guards on effective values.
  const effStarts = data.startsAt !== undefined ? (data.startsAt ? new Date(data.startsAt) : null) : existing.startsAt;
  const effExpires = data.expiresAt ? parseExpiry(data.expiresAt) : existing.expiresAt;
  if (effStarts && effExpires && effStarts.getTime() > effExpires.getTime()) {
    throw new AppError(400, 'Coupon start date must be before expiry date');
  }
  if (data.usageLimit !== undefined && data.usageLimit !== null && data.usageLimit < existing.usedCount) {
    throw new AppError(400, 'Usage limit cannot be below used count');
  }
  if (data.maxDiscount !== undefined && data.maxDiscount !== null) {
    const effType = data.type ?? existing.type;
    if (effType !== 'PERCENT') throw new AppError(400, 'maxDiscount only applies to PERCENT coupons');
    if (data.maxDiscount < 1) throw new AppError(400, 'maxDiscount must be positive');
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
      ...(data.applicableTourIds !== undefined ? { applicableTourIds: data.applicableTourIds as unknown as Prisma.InputJsonValue } : {}),
      ...(data.applicableCategory !== undefined ? { applicableCategory: data.applicableCategory } : {}),
      ...(data.startsAt !== undefined ? { startsAt: data.startsAt ? new Date(data.startsAt) : null } : {}),
      ...(data.maxDiscount !== undefined ? { maxDiscount: data.maxDiscount } : {}),
      ...(data.minGuests !== undefined ? { minGuests: data.minGuests } : {}),
    },
  });
}

export async function adminDeleteCoupon(id: string) {
  // Hard-delete would orphan audit history (Booking.couponId is SetNull).
  // Block when the coupon was ever used — disable via active=false instead.
  const used = await prisma.booking.count({ where: { couponId: id } });
  if (used > 0) throw new AppError(400, 'Cannot delete coupon with existing bookings');
  return prisma.coupon.delete({ where: { id } });
}

export function adminListTourDates(tourId: string) {
  return prisma.tourDate.findMany({
    where: { tourId },
    include: { guide: true, vehicle: true },
    orderBy: { date: 'asc' },
  });
}

export async function adminUpsertTourDate(
  tourId: string,
  dateStr: string,
  capacity: number,
  guideId?: string | null,
  vehicleId?: string | null,
) {
  const gId = typeof guideId === 'string' && guideId.trim() ? guideId.trim() : guideId ? guideId : null;
  const vId = typeof vehicleId === 'string' && vehicleId.trim() ? vehicleId.trim() : vehicleId ? vehicleId : null;
  const tour = await prisma.tour.findUnique({ where: { id: tourId } });
  if (!tour) throw new AppError(404, 'Tour not found');
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) throw new AppError(400, 'Invalid travel date');
  const day = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (day < todayUtc) throw new AppError(400, 'Invalid travel date');
  // Fleet must exist + active; capacity can never exceed the assigned vehicle.
  if (vId) {
    const v = await prisma.vehicle.findUnique({ where: { id: vId } });
    if (!v) throw new AppError(404, 'Vehicle not found');
    if (!v.active) throw new AppError(400, 'Vehicle is inactive');
    if (capacity > v.seats) throw new AppError(400, `Capacity cannot exceed vehicle seats (${v.seats})`);
  }
  if (gId) {
    const g = await prisma.guide.findUnique({ where: { id: gId } });
    if (!g) throw new AppError(404, 'Guide not found');
    if (!g.active) throw new AppError(400, 'Guide is inactive');
  }
  // Serialize against concurrent bookings touching the same bucket:
  // lock tour + date row inside a tx so capacity can't drop below booked
  // between check and upsert.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tour" WHERE "id" = ${tourId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "TourDate" WHERE "tourId" = ${tourId} AND "date" = ${day} FOR UPDATE`;
    const existing = await tx.tourDate.findUnique({ where: { tourId_date: { tourId, date: day } } });
    if (existing && capacity < existing.booked) {
      throw new AppError(400, 'Capacity cannot be below booked seats');
    }
    return tx.tourDate.upsert({
      where: { tourId_date: { tourId, date: day } },
      create: { tourId, date: day, capacity, guideId: gId ?? null, vehicleId: vId ?? null },
      update: {
        capacity,
        ...(guideId !== undefined ? { guideId: gId ?? null } : {}),
        ...(vehicleId !== undefined ? { vehicleId: vId ?? null } : {}),
      },
      include: { guide: true, vehicle: true },
    });
  });
}

export async function adminDeleteTourDate(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "TourDate" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.tourDate.findUnique({ where: { id } });
    if (!row) throw new AppError(404, 'Resource not found');
    if (row.booked > 0) {
      throw new AppError(400, 'Operation violates data constraints (record is in use)');
    }
    await tx.tourDate.delete({ where: { id } });
    return { success: true };
  });
}

// ---------------------------------------------------------------------------
// Doanh thu tổng quan theo tháng (màn Tổng quan kinh doanh) + báo cáo theo ngày
// (biên giờ VN nằm ở utils/revenue-time.ts để test được mà không cần DB)
// ---------------------------------------------------------------------------

/**
 * Tổng quan kinh doanh của 1 tháng:
 * - revenue: tiền thực thu (Payment PAID theo paidAt trong tháng, giờ VN)
 * - orders: đơn ghi nhận trong tháng (Booking tạo trong tháng, loại CANCELLED)
 * - completedOrders: đơn hoàn thành trong tháng (Booking COMPLETED theo
 *   updatedAt trong tháng — thời điểm admin bấm hoàn thành, cùng khung giờ VN
 *   với revenue để so sánh được)
 * - toursActive: tour đang bán
 * - completionRate: completedOrders / orders (hiệu suất thu trong tháng)
 * - byCategory: doanh thu theo danh mục tour (Biển/Núi/Văn hóa/Nghỉ dưỡng)
 * - trend: xu hướng 12 tháng của năm chọn (cho biểu đồ cột, theo paidAt)
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

  // Gom nhóm trong DB (không tải rows về Node): tổng theo danh mục, đếm theo
  // trạng thái, trend theo tháng VN (+7h trước khi trunc để khớp lịch hiển thị).
  // SUM dùng bigint để không tràn int khi doanh thu tháng > 2.1 tỷ.
  const [catGroups, bookingGroups, completedInMonth, toursActive, trendGroups] = await Promise.all([
    prisma.$queryRaw<Array<{ category: string; total: string | number; count: number }>>`
      SELECT t."category" AS "category", SUM(p."amount")::bigint AS "total", COUNT(*)::int AS "count"
      FROM "Payment" p
      JOIN "Booking" b ON b."id" = p."bookingId"
      JOIN "Tour" t ON t."id" = b."tourId"
      WHERE p."status" = 'PAID' AND p."paidAt" >= ${start} AND p."paidAt" < ${end}
      GROUP BY t."category" ORDER BY "total" DESC
    `,
    prisma.booking.groupBy({
      by: ['bookingStatus'],
      where: { createdAt: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    prisma.booking.count({
      where: { bookingStatus: 'COMPLETED', updatedAt: { gte: start, lt: end } },
    }),
    prisma.tour.count({ where: { status: 'ACTIVE' } }),
    prisma.$queryRaw<Array<{ key: string; total: string | number; orders: number }>>`
      SELECT to_char(date_trunc('month', ("paidAt" AT TIME ZONE 'UTC' + interval '7 hours')), 'YYYY-MM') AS "key",
             SUM("amount")::bigint AS "total", COUNT(*)::int AS "orders"
      FROM "Payment"
      WHERE "status" = 'PAID' AND "paidAt" >= ${yearStart} AND "paidAt" < ${yearEnd}
      GROUP BY 1
    `,
  ]);

  const revenue = catGroups.reduce((s, g) => s + Number(g.total), 0);
  const byCategory = catGroups.map((g) => ({ category: g.category, total: Number(g.total), count: g.count }));
  const countOf = (s: string) => bookingGroups.find((g) => g.bookingStatus === s)?._count._all ?? 0;
  const totalInMonth = bookingGroups.reduce((s, g) => s + g._count._all, 0);
  const completedOrders = completedInMonth;
  const orders = totalInMonth - countOf('CANCELLED');
  const completionRate = orders > 0 ? (completedOrders / orders) * 100 : 0;

  // Xu hướng 12 tháng trong năm
  const trend: Array<{ key: string; label: string; total: number; orders: number }> = [];
  for (let m = 1; m <= 12; m += 1) {
    const key = `${safeYear}-${String(m).padStart(2, '0')}`;
    trend.push({ key, label: `Tháng ${m}`, total: 0, orders: 0 });
  }
  const trendByKey = new Map(trend.map((t) => [t.key, t]));
  for (const g of trendGroups) {
    const bucket = trendByKey.get(g.key);
    if (bucket) {
      bucket.total = Number(g.total);
      bucket.orders = g.orders;
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
 * - pendingTotal/pendingCount: tiền đang chờ thu thật (PENDING/AWAITING tạo
 *   trong ngày; FAILED loại ra vì không bao giờ thu được cho tới khi retry)
 * - guests: tổng số khách trong ngày
 * - completedOrders: số booking COMPLETED trong ngày (theo updatedAt — thời
 *   điểm hoàn thành, không phải số payment PAID)
 * - transactions: thực thu (paidAt trong ngày) + chờ thu (createdAt trong ngày,
 *   PENDING/AWAITING), sắp xếp mới nhất trước, phân trang chung.
 */
export async function getRevenueDaily(dateInput?: unknown, page?: unknown, limit?: unknown) {
  const day = parseDay(dateInput);
  if (!day) throw new AppError(400, 'Invalid date');
  const { start, end, label } = day;
  const { page: p, limit: l } = pageParams(page, limit);

  // Tổng hợp bằng aggregate/count (chịu được ngày đông), chi tiết phân trang.
  // transactions = thực thu (paidAt trong ngày) UNION chờ thu (createdAt trong ngày, PENDING/AWAITING).
  const pendingWhere: Prisma.PaymentWhereInput = {
    createdAt: { gte: start, lt: end },
    status: { in: ['PENDING', 'AWAITING_CONFIRMATION'] },
  };
  const paidWhere: Prisma.PaymentWhereInput = { paidAt: { gte: start, lt: end }, status: 'PAID' };
  const [goodsAgg, paidAgg, completedCount, pendingAgg, pendingCount, paidTx, pendingTx] = await Promise.all([
    prisma.booking.aggregate({
      where: { createdAt: { gte: start, lt: end }, bookingStatus: { not: 'CANCELLED' } },
      _sum: { total: true, guests: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: paidWhere,
      _sum: { amount: true },
    }),
    prisma.booking.count({
      where: { bookingStatus: 'COMPLETED', updatedAt: { gte: start, lt: end } },
    }),
    prisma.payment.aggregate({ where: pendingWhere, _sum: { amount: true } }),
    prisma.payment.count({ where: pendingWhere }),
    prisma.payment.findMany({
      where: paidWhere,
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
    prisma.payment.findMany({
      where: pendingWhere,
      include: {
        booking: {
          include: {
            tour: { select: { id: true, title: true } },
            user: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const toTx = (pay: (typeof paidTx)[number] | (typeof pendingTx)[number]) => ({
    id: pay.transactionCode ?? pay.id,
    bookingId: pay.bookingId,
    bookingCode: pay.booking?.bookingCode ?? '',
    time: pay.paidAt ?? pay.createdAt,
    tourTitle: pay.booking?.tour?.title ?? '',
    customerName: pay.booking?.user?.name ?? pay.booking?.customerName ?? '',
    customerEmail: pay.booking?.customerEmail ?? '',
    method: pay.method,
    amount: pay.amount,
    status: pay.status,
  });
  // Gộp 2 luồng rồi sort mới-nhất-trước, phân trang trên mảng gộp (ngày đơn lẻ, < vài trăm GD).
  const merged = [...paidTx.map(toTx), ...pendingTx.map(toTx)].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
  );
  const txTotal = merged.length;
  const transactions = merged.slice((p - 1) * l, p * l);

  return {
    date: label,
    goodsTotal: goodsAgg._sum.total ?? 0,
    collectedTotal: paidAgg._sum.amount ?? 0,
    pendingTotal: pendingAgg._sum?.amount ?? 0,
    pendingCount,
    guests: goodsAgg._sum.guests ?? 0,
    totalBookings: goodsAgg._count._all,
    completedOrders: completedCount,
    transactions,
    pagination: { page: p, limit: l, total: txTotal, totalPages: Math.max(1, Math.ceil(txTotal / l)) },
  };
}
