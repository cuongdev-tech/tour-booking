import { Prisma } from '@prisma/client';
import { prisma } from '../config/env.js';
import { AppError, generateBookingCode, generateTransactionCode } from '../utils/helpers.js';
import { bookingConfirmationMail, isMailConfigured, sendMail } from '../utils/mailer.js';
import type { TourAddon } from '../validators/schemas.js';
import { resolveCoupon } from './coupon.service.js';
import { toCalendarDay } from './tour.service.js';

interface GuestInput {
  fullName: string;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  isChild?: boolean;
  phone?: string;
  email?: string;
}

interface CreateBookingInput {
  userId: string;
  tourId: string;
  travelDate: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  note?: string;
  couponCode?: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CARD';
  guestsList: GuestInput[];
  addons?: string[];
}

/** Defensive parse: admin-edited rows must never crash pricing. */
export function parseTourAddons(raw: unknown): TourAddon[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is TourAddon =>
      !!a &&
      typeof a === 'object' &&
      typeof (a as TourAddon).id === 'string' &&
      typeof (a as TourAddon).name === 'string' &&
      Number.isInteger((a as TourAddon).price) &&
      (a as TourAddon).price > 0 &&
      typeof (a as TourAddon).perPerson === 'boolean',
  );
}

interface Fare {
  adults: number;
  children: number;
  subtotal: number;
  addonsTotal: number;
}

/**
 * Fare math (single source of truth for create + update):
 * subtotal = adults × price + children × childPrice (coupon applies here),
 * add-ons on top (per-person × party size, per-booking flat).
 */
function computeFare(opts: {
  price: number;
  childPrice: number | null;
  guestsList: GuestInput[];
  selectedAddons: TourAddon[];
}): Fare {
  const adults = opts.guestsList.filter((g) => !g.isChild).length;
  const children = opts.guestsList.length - adults;
  if (adults < 1) throw new AppError(400, 'At least one adult is required');
  if (children > 0 && opts.childPrice == null) throw new AppError(400, 'Tour does not offer child tickets');
  const subtotal = adults * opts.price + children * (opts.childPrice ?? opts.price);
  const party = opts.guestsList.length;
  const addonsTotal = opts.selectedAddons.reduce(
    (sum, a) => sum + (a.perPerson ? a.price * party : a.price),
    0,
  );
  return { adults, children, subtotal, addonsTotal };
}

/** Full years of age at a reference date (UTC calendar days). */
function ageAt(dob: Date, at: Date): number {
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const m = at.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

/**
 * Child-ticket eligibility: `isChild` is customer-declared, so it must be
 * backed by a date of birth whose age at travel fits the tour's childMaxAge
 * (under 18 when the tour sets no explicit limit).
 */
function assertChildAges(guestsList: GuestInput[], childMaxAge: number | null, travelDate: Date): void {
  const maxAge = childMaxAge ?? 17;
  for (const g of guestsList) {
    if (!g.isChild) continue;
    if (!g.dateOfBirth) throw new AppError(400, 'Child date of birth is required');
    const dob = new Date(g.dateOfBirth);
    if (Number.isNaN(dob.getTime())) throw new AppError(400, 'Child date of birth is required');
    const age = ageAt(dob, travelDate);
    if (age < 0 || age > maxAge) throw new AppError(400, 'Child age is not eligible for child tickets');
  }
}

/** Validate requested add-on ids against the tour's current catalogue. */
function resolveAddonIds(tourAddons: TourAddon[], addonIds: string[] | undefined): TourAddon[] {  const ids = [...new Set((addonIds ?? []).map((s) => s.trim()).filter(Boolean))];
  return ids.map((id) => {
    const found = tourAddons.find((a) => a.id === id);
    if (!found) throw new AppError(400, 'Selected add-ons are invalid');
    return found;
  });
}

/**
 * Booking creation — ONE Prisma transaction:
 * Booking + BookingGuest[] + Payment(PENDING for all methods, no gateway yet)
 * + decrement Tour.availableSeats + increment Coupon.usedCount.
 * Any failure rolls back everything.
 */
export async function createBooking(input: CreateBookingInput) {
  const tour = await prisma.tour.findUnique({ where: { id: input.tourId } });
  if (!tour) throw new AppError(404, 'Tour not found');
  if (tour.status !== 'ACTIVE') throw new AppError(400, 'Tour is not available for booking');

  const travelDate = new Date(input.travelDate);
  if (Number.isNaN(travelDate.getTime())) throw new AppError(400, 'Invalid travel date');
  // Compare calendar days in UTC so the result does not depend on the server's
  // local timezone (ISO date-only strings parse as UTC midnight).
  const travelDay = Date.UTC(travelDate.getUTCFullYear(), travelDate.getUTCMonth(), travelDate.getUTCDate());
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (travelDay < todayUtc) throw new AppError(400, 'Travel date must be today or in the future');

  const guestCount = input.guestsList.length;
  if (guestCount < tour.minGuests) throw new AppError(400, `Tour requires at least ${tour.minGuests} guest(s)`);
  if (guestCount > tour.maxGuests) throw new AppError(400, `Tour allows at most ${tour.maxGuests} guest(s)`);

  const bookingCode = generateBookingCode();

  const booking = await prisma.$transaction(async (tx) => {
    // Lock the tour row so concurrent bookings on the same tour serialize
    // instead of overselling availableSeats.
    await tx.$queryRaw`SELECT "id" FROM "Tour" WHERE "id" = ${tour.id} FOR UPDATE`;
    // Re-read inside the transaction: seats, status AND price are authoritative here.
    const freshTour = await tx.tour.findUnique({ where: { id: tour.id } });
    if (!freshTour || freshTour.status !== 'ACTIVE') throw new AppError(400, 'Tour is no longer available');
    if (guestCount < freshTour.minGuests) throw new AppError(400, `Tour requires at least ${freshTour.minGuests} guest(s)`);
    if (guestCount > freshTour.maxGuests) throw new AppError(400, `Tour allows at most ${freshTour.maxGuests} guest(s)`);
    if (guestCount > freshTour.availableSeats)
      throw new AppError(400, `Only ${freshTour.availableSeats} seat(s) left`);
    // Child fares are customer-declared: back every isChild with a real age.
    assertChildAges(input.guestsList, freshTour.childMaxAge, travelDate);

    // Per-date inventory: dates WITHOUT a managed row stay open (global seats
    // only); dates WITH a row are capped. Row is locked like the tour row.
    const day = toCalendarDay(travelDate);
    await tx.$queryRaw`SELECT "id" FROM "TourDate" WHERE "tourId" = ${tour.id} AND "date" = ${day} FOR UPDATE`;
    const dateRow = await tx.tourDate.findUnique({ where: { tourId_date: { tourId: tour.id, date: day } } });
    if (dateRow) {
      if (dateRow.booked + guestCount > dateRow.capacity)
        throw new AppError(400, 'This date is sold out');
      await tx.tourDate.update({ where: { id: dateRow.id }, data: { booked: { increment: guestCount } } });
    }

    // Backend-calculated pricing — never trust frontend subtotal/discount/total.
    // Lock the coupon row (if any) so concurrent bookings can't overshoot usageLimit.
    if (input.couponCode?.trim()) {
      const code = input.couponCode.trim().toUpperCase();
      await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "code" = ${code} FOR UPDATE`;
    }
    const tourAddons = parseTourAddons(freshTour.addons);
    const selectedAddons = resolveAddonIds(tourAddons, input.addons);
    const fare = computeFare({
      price: freshTour.price,
      childPrice: freshTour.childPrice,
      guestsList: input.guestsList,
      selectedAddons,
    });
    const subtotal = fare.subtotal;
    const { couponId, discount } = await resolveCoupon(input.couponCode, subtotal, tx);
    const addonsTotal = fare.addonsTotal;
    const total = subtotal - discount + addonsTotal;

    const created = await tx.booking.create({
      data: {
        bookingCode,
        userId: input.userId,
        tourId: tour.id,
        couponId,
        travelDate,
        guests: guestCount,
        adults: fare.adults,
        children: fare.children,
        addons: selectedAddons as unknown as Prisma.InputJsonValue,
        addonsTotal,
        customerName: input.customerName.trim(),
        customerEmail: input.customerEmail.toLowerCase(),
        customerPhone: input.customerPhone.trim(),
        note: input.note?.trim() || null,
        subtotal,
        discount,
        total,
        bookingStatus: 'CONFIRMED',
      },
    });

    await tx.bookingGuest.createMany({
      data: input.guestsList.map((g) => ({
        bookingId: created.id,
        fullName: g.fullName.trim(),
        dateOfBirth: g.dateOfBirth ? new Date(g.dateOfBirth) : null,
        gender: g.gender ?? null,
        isChild: g.isChild ?? false,
        phone: g.phone?.trim() || null,
        email: g.email?.toLowerCase() || null,
      })),
    });

    // No payment gateway yet -> PENDING for CASH/BANK_TRANSFER/CARD.
    await tx.payment.create({
      data: {
        bookingId: created.id,
        amount: total,
        method: input.paymentMethod,
        status: 'PENDING',
        transactionCode: generateTransactionCode(input.paymentMethod),
      },
    });

    await tx.tour.update({
      where: { id: tour.id },
      data: { availableSeats: { decrement: guestCount } },
    });

    if (couponId) {
      await tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
    }

    return created;
  });

  const full = await prisma.booking.findUnique({
    where: { id: booking.id },
    include: { tour: true, guestsList: true, payment: true, coupon: true },
  });

  // Email xác nhận (fire-and-forget): booking thành công dù mail lỗi/thiếu cấu hình.
  if (full && isMailConfigured()) {
    const { subject, text } = bookingConfirmationMail({
      bookingCode: full.bookingCode,
      tourTitle: full.tour?.title ?? full.tourId,
      travelDate: full.travelDate,
      guests: full.guests,
      total: full.total,
      customerName: full.customerName,
    });
    sendMail(full.customerEmail, subject, text).catch((err) => console.error('booking confirmation mail failed:', err));
  }
  return full;
}

export function getMyBookings(userId: string) {
  return prisma.booking.findMany({
    where: { userId },
    include: { tour: true, guestsList: true, payment: true, coupon: true },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Customer reports "I have transferred the money" (bank transfer only).
 * PENDING/FAILED → AWAITING_CONFIRMATION so the admin bell picks it up and
 * verifies the statement before capturing (PAID) or rejecting (FAILED).
 */
export async function confirmTransfer(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });
  if (!booking) throw new AppError(404, 'Booking not found');
  if (booking.userId !== userId) throw new AppError(403, 'Not your booking');
  if (booking.bookingStatus !== 'PENDING' && booking.bookingStatus !== 'CONFIRMED') {
    throw new AppError(400, 'Invalid status transition');
  }
  if (!booking.payment) throw new AppError(400, 'Booking has no payment');
  if (booking.payment.method !== 'BANK_TRANSFER') throw new AppError(400, 'Invalid status transition');
  if (booking.payment.status !== 'PENDING' && booking.payment.status !== 'FAILED') {
    throw new AppError(400, 'Invalid status transition');
  }
  return prisma.payment.update({
    where: { bookingId },
    data: { status: 'AWAITING_CONFIRMATION' },
  });
}

/**
 * Customer bell feed: own bookings whose payment reached a terminal-ish state
 * the customer should know about (admin confirmed PAID or rejected FAILED).
 * Seen-state lives on the client (localStorage baseline) — no extra table.
 */
export function getPaymentUpdates(userId: string) {
  return prisma.booking.findMany({
    where: {
      userId,
      bookingStatus: { not: 'CANCELLED' },
      payment: { status: { in: ['PAID', 'FAILED', 'REFUNDED'] } },
    },
    select: {
      id: true,
      bookingCode: true,
      total: true,
      travelDate: true,
      tour: { select: { title: true } },
      payment: { select: { status: true, paidAt: true, updatedAt: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
}

export function getBookingByCode(bookingCode: string, userId: string, isAdmin: boolean) {
  return prisma.booking.findFirst({
    where: { bookingCode, ...(isAdmin ? {} : { userId }) },
    include: { tour: true, guestsList: true, payment: true, coupon: true },
  });
}

/**
 * Public ticket verification (QR target): NO personal data — only what an
 * operator needs to check the ticket at departure.
 */
export function getPublicTicket(bookingCode: string) {
  return prisma.booking
    .findUnique({
      where: { bookingCode },
      include: {
        tour: { select: { id: true, title: true, images: true, destination: true, duration: true } },
        payment: { select: { method: true, status: true } },
      },
    })
    .then((b) => {
      if (!b) return null;
      return {
        bookingCode: b.bookingCode,
        tour: b.tour,
        travelDate: b.travelDate,
        guests: b.guests,
        adults: b.adults ?? b.guests,
        children: b.children ?? 0,
        bookingStatus: b.bookingStatus,
        payment: b.payment,
      };
    });
}

interface UpdateBookingInput {
  travelDate?: string;
  guestsList?: GuestInput[];
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  note?: string | null;
}

/**
 * Customer edits their own upcoming booking (date / travelers / contact / note).
 * Money stays truthful: seats move atomically (global + per-date buckets),
 * totals are recomputed, the coupon is re-validated, and the pending payment
 * amount follows the new total. Paid bookings are immutable (refund = cancel).
 */
export async function updateBooking(bookingId: string, userId: string, input: UpdateBookingInput) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true, coupon: true, guestsList: true },
  });
  if (!booking) throw new AppError(404, 'Booking not found');
  if (booking.userId !== userId) throw new AppError(403, 'Not your booking');
  if (booking.bookingStatus !== 'PENDING' && booking.bookingStatus !== 'CONFIRMED') {
    throw new AppError(400, 'Only upcoming bookings can be modified');
  }
  if (booking.payment && booking.payment.status !== 'PENDING') {
    throw new AppError(
      400,
      booking.payment.status === 'PAID' ? 'Paid bookings cannot be modified' : 'Payment is being processed and cannot be modified',
    );
  }

  const todayUtc = (() => {
    const n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  })();
  const currentDay = Date.UTC(
    booking.travelDate.getUTCFullYear(),
    booking.travelDate.getUTCMonth(),
    booking.travelDate.getUTCDate(),
  );
  if (currentDay < todayUtc) throw new AppError(400, 'Cannot modify a tour that already started');

  const newTravelDate = input.travelDate ? new Date(input.travelDate) : booking.travelDate;
  if (Number.isNaN(newTravelDate.getTime())) throw new AppError(400, 'Invalid travel date');
  const newDay = Date.UTC(newTravelDate.getUTCFullYear(), newTravelDate.getUTCMonth(), newTravelDate.getUTCDate());
  if (newDay < todayUtc) throw new AppError(400, 'Travel date must be today or in the future');

  const newGuestsList: GuestInput[] = input.guestsList ?? booking.guestsList.map((g) => ({
    fullName: g.fullName,
    dateOfBirth: g.dateOfBirth ? g.dateOfBirth.toISOString() : undefined,
    gender: g.gender ?? undefined,
    isChild: g.isChild,
    phone: g.phone ?? undefined,
    email: g.email ?? undefined,
  }));
  const newCount = newGuestsList.length;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tour" WHERE "id" = ${booking.tourId} FOR UPDATE`;
    const tour = await tx.tour.findUnique({ where: { id: booking.tourId } });
    if (!tour || tour.status !== 'ACTIVE') throw new AppError(400, 'Tour is no longer available');
    if (newCount < tour.minGuests) throw new AppError(400, `Tour requires at least ${tour.minGuests} guest(s)`);
    if (newCount > tour.maxGuests) throw new AppError(400, `Tour allows at most ${tour.maxGuests} guest(s)`);
    // Child fares are customer-declared: back every isChild with a real age.
    assertChildAges(newGuestsList, tour.childMaxAge, newTravelDate);

    // Re-check money state inside the transaction: an admin capture (PAID)
    // landing between the pre-check and here must abort — the pending payment
    // amount follows the total and must never move after capture.
    if (booking.payment) {
      await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "bookingId" = ${bookingId} FOR UPDATE`;
      const freshPayment = await tx.payment.findUnique({ where: { bookingId } });
      if (!freshPayment || freshPayment.status !== 'PENDING') {
        throw new AppError(
          400,
          freshPayment?.status === 'PAID' ? 'Paid bookings cannot be modified' : 'Payment is being processed and cannot be modified',
        );
      }
    }

    const delta = newCount - booking.guests;
    if (delta > 0 && delta > tour.availableSeats) {
      throw new AppError(400, `Only ${tour.availableSeats} seat(s) left`);
    }

    // Move seats between per-date buckets (only managed dates are tracked).
    const oldDay = toCalendarDay(booking.travelDate);
    const targetDay = toCalendarDay(newTravelDate);
    if (oldDay.getTime() !== targetDay.getTime()) {
      await tx.$queryRaw`SELECT "id" FROM "TourDate" WHERE "tourId" = ${booking.tourId} AND "date" = ${oldDay} FOR UPDATE`;
      const oldRow = await tx.tourDate.findUnique({
        where: { tourId_date: { tourId: booking.tourId, date: oldDay } },
      });
      if (oldRow && oldRow.booked > 0) {
        await tx.tourDate.update({
          where: { id: oldRow.id },
          data: { booked: Math.max(0, oldRow.booked - booking.guests) },
        });
      }
    }
    await tx.$queryRaw`SELECT "id" FROM "TourDate" WHERE "tourId" = ${booking.tourId} AND "date" = ${targetDay} FOR UPDATE`;
    const targetRow = await tx.tourDate.findUnique({
      where: { tourId_date: { tourId: booking.tourId, date: targetDay } },
    });
    if (targetRow) {
      const alreadyThere = oldDay.getTime() === targetDay.getTime() ? booking.guests : 0;
      if (targetRow.booked - alreadyThere + newCount > targetRow.capacity) {
        throw new AppError(400, 'This date is sold out');
      }
      await tx.tourDate.update({
        where: { id: targetRow.id },
        data: { booked: targetRow.booked - alreadyThere + newCount },
      });
    }

    if (delta !== 0) {
      await tx.tour.update({
        where: { id: booking.tourId },
        data: { availableSeats: { increment: -delta } },
      });
    }

    // Re-price from scratch; the attached coupon must still qualify.
    // The booking itself holds one usage slot, so the usageLimit check allows
    // own usage (usedCount - 1). If the coupon no longer qualifies (expired /
    // inactive / minOrder), drop it instead of blocking the whole edit.
    // Add-ons keep their snapshot (recomputed quantities for per-person items).
    const snapshotAddons = parseTourAddons(booking.addons);
    const fare = computeFare({
      price: tour.price,
      childPrice: tour.childPrice,
      guestsList: newGuestsList,
      selectedAddons: snapshotAddons,
    });
    const subtotal = fare.subtotal;
    let couponId = booking.couponId;
    let discount = 0;
    if (booking.coupon && booking.couponId) {
      const code = booking.coupon.code.trim().toUpperCase();
      await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "code" = ${code} FOR UPDATE`;
      const freshCoupon = await tx.coupon.findUnique({ where: { code } });
      if (!freshCoupon) {
        couponId = null;
        discount = 0;
      } else {
        const occupiedBySelf = freshCoupon.id === booking.couponId ? 1 : 0;
        const usable =
          freshCoupon.active &&
          freshCoupon.expiresAt.getTime() >= Date.now() &&
          subtotal >= freshCoupon.minOrder &&
          (freshCoupon.usageLimit === null || freshCoupon.usedCount - occupiedBySelf < freshCoupon.usageLimit);
        if (!usable) {
          couponId = null;
          discount = 0;
        } else {
          const raw =
            freshCoupon.type === 'PERCENT' ? Math.floor((subtotal * freshCoupon.value) / 100) : freshCoupon.value;
          couponId = freshCoupon.id;
          discount = Math.min(raw, subtotal);
        }
      }
    }
    const total = subtotal - discount + fare.addonsTotal;

    // Dropping a coupon that held a usage slot must return the quota
    // (mirrors cancelBooking), otherwise the slot leaks forever.
    if (booking.couponId && !couponId) {
      await tx.coupon.updateMany({
        where: { id: booking.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
    }

    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        travelDate: newTravelDate,
        guests: newCount,
        adults: fare.adults,
        children: fare.children,
        addonsTotal: fare.addonsTotal,
        customerName: input.customerName?.trim() || booking.customerName,
        customerEmail: input.customerEmail?.toLowerCase() || booking.customerEmail,
        customerPhone: input.customerPhone?.trim() || booking.customerPhone,
        note: input.note === undefined ? booking.note : input.note?.trim() || null,
        subtotal,
        discount,
        total,
        couponId,
      },
    });

    if (input.guestsList) {
      await tx.bookingGuest.deleteMany({ where: { bookingId } });
      await tx.bookingGuest.createMany({
        data: newGuestsList.map((g) => ({
          bookingId,
          fullName: g.fullName.trim(),
          dateOfBirth: g.dateOfBirth ? new Date(g.dateOfBirth) : null,
          gender: g.gender ?? null,
          isChild: g.isChild ?? false,
          phone: g.phone?.trim() || null,
          email: g.email?.toLowerCase() || null,
        })),
      });
    }
    if (booking.payment) {
      await tx.payment.update({ where: { bookingId }, data: { amount: total } });
    }
    return updated;
  }).then((updated) =>
    prisma.booking.findUnique({
      where: { id: updated.id },
      include: { tour: true, guestsList: true, payment: true, coupon: true },
    }),
  );
}

export async function cancelBooking(bookingId: string, userId: string, isAdmin: boolean) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });
  if (!booking) throw new AppError(404, 'Booking not found');
  if (!isAdmin && booking.userId !== userId) throw new AppError(403, 'Not your booking');
  if (booking.bookingStatus === 'CANCELLED') throw new AppError(400, 'Booking already cancelled');
  if (booking.bookingStatus === 'COMPLETED') throw new AppError(400, 'Completed booking cannot be cancelled');
  // No cancelling after the tour has started (compare calendar days in UTC, same as creation).
  const bookedDay = Date.UTC(
    booking.travelDate.getUTCFullYear(),
    booking.travelDate.getUTCMonth(),
    booking.travelDate.getUTCDate(),
  );
  const nowDay = new Date();
  const todayUtc = Date.UTC(nowDay.getUTCFullYear(), nowDay.getUTCMonth(), nowDay.getUTCDate());
  if (bookedDay < todayUtc) throw new AppError(400, 'Cannot cancel a tour that already started');

  // Per-tour free-cancellation window: a PAID booking past its deadline can no
  // longer be cancelled by the customer (admins bypass). Unpaid PENDING
  // bookings cost nothing to release, so they stay freely cancellable.
  if (!isAdmin && booking.payment?.status === 'PAID') {
    const tour = await prisma.tour.findUnique({
      where: { id: booking.tourId },
      select: { freeCancelHours: true },
    });
    if (tour?.freeCancelHours != null) {
      const deadline = booking.travelDate.getTime() - tour.freeCancelHours * 3600_000;
      if (Date.now() > deadline) throw new AppError(400, 'Free cancellation period has ended');
    }
  }

  return prisma.$transaction(async (tx) => {
    // Lock every row this cancel touches so concurrent create/cancel/admin
    // actions serialize instead of double-restoring seats or coupon quota.
    const cancelDay = toCalendarDay(booking.travelDate);
    await tx.$queryRaw`SELECT "id" FROM "Tour" WHERE "id" = ${booking.tourId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "TourDate" WHERE "tourId" = ${booking.tourId} AND "date" = ${cancelDay} FOR UPDATE`;
    if (booking.couponId) {
      await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "id" = ${booking.couponId} FOR UPDATE`;
    }
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { bookingStatus: 'CANCELLED' },
    });
    // Restore seats.
    await tx.tour.update({
      where: { id: booking.tourId },
      data: { availableSeats: { increment: booking.guests } },
    });
    // Release the per-date bucket (if the travel day is managed).
    const cancelRow = await tx.tourDate.findUnique({
      where: { tourId_date: { tourId: booking.tourId, date: cancelDay } },
    });
    if (cancelRow && cancelRow.booked > 0) {
      await tx.tourDate.update({
        where: { id: cancelRow.id },
        data: { booked: Math.max(0, cancelRow.booked - booking.guests) },
      });
    }
    // Give the coupon quota back (a cancelled booking must not consume it).
    if (booking.couponId) {
      await tx.coupon.updateMany({
        where: { id: booking.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
    }
    // If money was captured, mark refunded; PENDING stays PENDING. A transfer
    // reported but never verified (AWAITING_CONFIRMATION) also goes back to
    // PENDING — nothing was captured in our books.
    if (booking.payment?.status === 'PAID') {
      await tx.payment.update({ where: { bookingId }, data: { status: 'REFUNDED' } });
    } else if (booking.payment?.status === 'AWAITING_CONFIRMATION') {
      await tx.payment.update({ where: { bookingId }, data: { status: 'PENDING' } });
    }
    return updated;
  });
}
