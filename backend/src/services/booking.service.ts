import { Prisma } from '@prisma/client';
import { env, prisma } from '../config/env.js';
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
  loyaltyPoints?: number;
  isPrivate?: boolean;
  currency?: string;
  vat?: { name?: string; taxCode?: string; address?: string; email?: string };
  comboId?: string;
  comboGroup?: string;
  comboDiscountPercent?: number;
}

/** Tiered group price: [{minGuests, price, childPrice?}] — highest qualifying tier wins. */
export function parsePriceTiers(raw: unknown): Array<{ minGuests: number; price: number; childPrice?: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (t): t is { minGuests: number; price: number; childPrice?: number } =>
        !!t &&
        typeof t === 'object' &&
        Number.isInteger((t as { minGuests: number }).minGuests) &&
        (t as { minGuests: number }).minGuests >= 1 &&
        Number.isInteger((t as { price: number }).price) &&
        (t as { price: number }).price > 0,
    )
    .sort((a, b) => a.minGuests - b.minGuests);
}

export function resolveUnitPrice(
  tour: { price: number; childPrice: number | null; priceTiers: unknown },
  guests: number,
): { price: number; childPrice: number | null; tierMin: number | null } {
  const tiers = parsePriceTiers(tour.priceTiers);
  let price = tour.price;
  let childPrice = tour.childPrice;
  let tierMin: number | null = null;
  for (const t of tiers) {
    if (guests >= t.minGuests) {
      price = t.price;
      if (t.childPrice != null && t.childPrice > 0) childPrice = t.childPrice;
      tierMin = t.minGuests;
    }
  }
  return { price, childPrice, tierMin };
}

/** VAT amount for an optional company invoice (rate from env, default 10%).
 * Tour prices are VAT-inclusive: this backs the VAT portion out of the total
 * (display/audit only — the charged total and Payment.amount never change). */
export function computeVat(total: number): number {
  const rate = Number(env.vatRate);
  if (!Number.isFinite(rate) || rate <= 0 || total <= 0) return 0;
  return Math.round((total * rate) / (1 + rate));
}

export interface CancelPolicy {
  freeCancel: boolean;
  deadline: string | null;
  freeCancelHours: number | null;
  refundable: boolean;
}

/** Customer-facing cancellation policy for a booking (mirrors cancelBooking guards). */
export function getCancelPolicy(
  booking: { travelDate: Date; payment?: { status: string } | null },
  freeCancelHours: number | null,
): CancelPolicy {
  if (freeCancelHours == null) {
    return { freeCancel: true, deadline: null, freeCancelHours: null, refundable: true };
  }
  const deadline = new Date(booking.travelDate.getTime() - freeCancelHours * 3600_000);
  const paid = booking.payment?.status === 'PAID';
  // Unpaid bookings cost nothing to release — always free to cancel.
  const freeCancel = !paid || Date.now() <= deadline.getTime();
  return { freeCancel, deadline: deadline.toISOString(), freeCancelHours, refundable: !paid || freeCancel };
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
 * Booking (CONFIRMED, seats held immediately — no gateway yet) +
 * BookingGuest[] + Payment(PENDING for all methods) + decrement
 * Tour.availableSeats + increment Coupon.usedCount.
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

  // bookingCode/transactionCode collisions are rare but possible — retry with
  // a fresh code instead of surfacing a confusing 409.
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const bookingCode = generateBookingCode();
    try {
      return await createBookingOnce(input, tour, travelDate, guestCount, bookingCode);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        Array.isArray(err.meta?.target) &&
        (err.meta.target as string[]).some((f) => f === 'bookingCode' || f === 'transactionCode')
      ) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function createBookingOnce(
  input: CreateBookingInput,
  tour: { id: string },
  travelDate: Date,
  guestCount: number,
  bookingCode: string,
) {
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
    // Tiered group pricing: unit prices depend on party size (snapshot below).
    const units = resolveUnitPrice(freshTour as { price: number; childPrice: number | null; priceTiers: unknown }, guestCount);
    // Private tour: flat surcharge on top, must be offered by the tour.
    const isPrivate = input.isPrivate === true;
    if (isPrivate && !(freshTour as { privateAvailable?: boolean }).privateAvailable) {
      throw new AppError(400, 'Private tour is not available');
    }
    const privateSurcharge = isPrivate ? ((freshTour as { privateSurcharge?: number }).privateSurcharge ?? 0) : 0;
    const fare = computeFare({
      price: units.price,
      childPrice: units.childPrice,
      guestsList: input.guestsList,
      selectedAddons,
    });
    const subtotal = fare.subtotal;
    const { couponId, discount: couponDiscount } = await resolveCoupon(input.couponCode, subtotal, tx, {
      tourId: tour.id,
      category: (freshTour as { category?: string }).category,
      guests: guestCount,
    });
    // Combo legs (2nd+ or all): percent off subtotal, folded into discount.
    const comboPct = Math.min(90, Math.max(0, Math.floor(input.comboDiscountPercent ?? 0)));
    const comboDiscount = comboPct > 0 ? Math.floor((subtotal * comboPct) / 100) : 0;
    const discount = Math.min(subtotal, couponDiscount + comboDiscount);
    const addonsTotal = fare.addonsTotal;
    // Loyalty redeem: 1 điểm = 1.000₫, tối đa 20% subtotal, trừ trong tx.
    const wantPoints = Math.max(0, Math.floor(input.loyaltyPoints ?? 0));
    let loyaltyUsed = 0;
    let loyaltyDiscount = 0;
    if (wantPoints > 0) {
      const { loyaltyDiscountFor } = await import('./loyalty.service.js');
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
      const loyaltyUser = await tx.user.findUnique({ where: { id: input.userId }, select: { loyaltyPoints: true } });
      const balance = loyaltyUser?.loyaltyPoints ?? 0;
      const usable = Math.min(wantPoints, balance);
      if (usable <= 0) throw new AppError(400, 'Not enough loyalty points');
      loyaltyDiscount = loyaltyDiscountFor(usable, subtotal - discount);
      // Round used points down to actual discount (1000₫/point).
      loyaltyUsed = Math.min(usable, Math.floor(loyaltyDiscount / 1000));
      loyaltyDiscount = loyaltyUsed * 1000;
      if (loyaltyUsed > 0) {
        await tx.user.update({ where: { id: input.userId }, data: { loyaltyPoints: { decrement: loyaltyUsed } } });
      }
    }
    const total = Math.max(0, subtotal - discount - loyaltyDiscount + addonsTotal + privateSurcharge);
    // Display-only currency preference (all money stays VND — see /payments/rates).
    const currency = (input.currency ?? 'VND').trim().toUpperCase() || 'VND';
    const DISPLAY_CURRENCIES = ['VND', 'USD', 'EUR', 'JPY', 'KRW', 'CNY', 'THB'];
    if (!DISPLAY_CURRENCIES.includes(currency)) throw new AppError(400, 'Invalid currency');
    const vat = input.vat && (input.vat.name || input.vat.taxCode)
      ? {
          vatName: input.vat.name?.trim() || null,
          vatTaxCode: input.vat.taxCode?.trim() || null,
          vatAddress: input.vat.address?.trim() || null,
          vatEmail: input.vat.email?.trim().toLowerCase() || null,
        }
      : { vatName: null, vatTaxCode: null, vatAddress: null, vatEmail: null };
    const vatAmount = vat.vatName || vat.vatTaxCode ? computeVat(total) : 0;

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
        customerEmail: input.customerEmail.trim().toLowerCase(),
        customerPhone: input.customerPhone.trim(),
        note: input.note?.trim() || null,
        subtotal,
        discount,
        total,
        loyaltyUsed,
        loyaltyDiscount,
        // Snapshot unit prices so later tour.price edits never rewrite history.
        adultUnitPrice: units.price,
        childUnitPrice: units.childPrice,
        isPrivate,
        privateSurcharge,
        comboId: input.comboId ?? null,
        comboGroup: input.comboGroup ?? null,
        currency,
        vatAmount,
        ...vat,
        // Hold timer: online methods keep seats N minutes while PENDING;
        // CASH pays at departure so no expiry.
        holdExpiresAt:
          input.paymentMethod === 'CASH' ? null : new Date(Date.now() + env.holdMinutes * 60_000),
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
        email: g.email ? g.email.trim().toLowerCase() : null,
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

    if (loyaltyUsed > 0) {
      await tx.loyaltyTransaction.create({
        data: { userId: input.userId, points: -loyaltyUsed, type: 'REDEEM', bookingId: created.id },
      });
    }

    return created;
  });

  const { signTicket } = await import('../utils/ticket.js');
  const ticketSignature = signTicket({
    code: bookingCode,
    travelDateISO: travelDate.toISOString(),
    guests: guestCount,
  });
  await prisma.booking.update({ where: { id: booking.id }, data: { ticketSignature } });

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

export async function getMyBookings(userId: string, page?: unknown, limit?: unknown) {
  // Optional pagination (backward-compat: no params → full array as before).
  // Paginated list uses a lean tour select (no itinerary/description/addons blobs).
  const hasPaging = page !== undefined || limit !== undefined;
  if (!hasPaging) {
    return prisma.booking.findMany({
      where: { userId },
      include: { tour: true, guestsList: true, payment: true, coupon: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const l = Math.min(50, Math.max(1, Math.floor(Number(limit) || 10)));
  const [count, lean] = await Promise.all([
    prisma.booking.count({ where: { userId } }),
    prisma.booking.findMany({
      where: { userId },
      include: {
        guestsList: true,
        payment: true,
        coupon: true,
        tour: {
          select: {
            id: true, slug: true, title: true, category: true, departureLocation: true,
            destination: true, transportation: true, images: true, duration: true,
            price: true, childPrice: true, childMaxAge: true, freeCancelHours: true,
            minGuests: true, maxGuests: true, availableSeats: true, rating: true,
            reviewCount: true, featured: true, status: true, createdAt: true, updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return { data: lean, pagination: { page: p, limit: l, total: count, totalPages: Math.max(1, Math.ceil(count / l)) } };
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
 * Customer bell feed: own bookings whose payment reached a state
 * the customer should know about (admin confirmed PAID, rejected FAILED,
 * or refunded REFUNDED — including refunds on cancelled bookings so the
 * customer actually sees the refund notice).
 * Seen-state lives on the client (localStorage baseline) — no extra table.
 */
export function getPaymentUpdates(userId: string) {
  return prisma.booking.findMany({
    where: {
      userId,
      OR: [
        {
          bookingStatus: { not: 'CANCELLED' },
          payment: { status: { in: ['PAID', 'FAILED', 'REFUNDED'] } },
        },
        {
          payment: { status: 'REFUNDED' },
        },
      ],
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
  // PENDING and FAILED are both uncaptured (FAILED = transfer rejected, money
  // never moved) so both stay editable. PAID/AWAITING are locked.
  if (booking.payment && booking.payment.status !== 'PENDING' && booking.payment.status !== 'FAILED') {
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
    // Serialize against a concurrent cancel: lock the booking row and re-check
    // status inside the tx (the pre-check outside can't prevent an edit racing a cancel).
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
    const freshBooking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!freshBooking) throw new AppError(404, 'Booking not found');
    if (freshBooking.bookingStatus !== 'PENDING' && freshBooking.bookingStatus !== 'CONFIRMED') {
      throw new AppError(400, 'Only upcoming bookings can be modified');
    }
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
    // FAILED is treated like PENDING (no money captured, editable).
    if (booking.payment) {
      await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "bookingId" = ${bookingId} FOR UPDATE`;
      const freshPayment = await tx.payment.findUnique({ where: { bookingId } });
      if (!freshPayment || (freshPayment.status !== 'PENDING' && freshPayment.status !== 'FAILED')) {
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
    // inactive / minOrder / scope), drop it instead of blocking the whole edit.
    // Add-ons keep their snapshot (recomputed quantities for per-person items).
    // Loyalty redeemed earlier is kept as-is (no new redeem on edit).
    const snapshotAddons = parseTourAddons(booking.addons);
    const editUnits = resolveUnitPrice(tour as { price: number; childPrice: number | null; priceTiers: unknown }, newCount);
    const fare = computeFare({
      price: editUnits.price,
      childPrice: editUnits.childPrice,
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
        const c = freshCoupon as typeof freshCoupon & {
          startsAt?: Date | null;
          minGuests?: number;
          applicableTourIds?: unknown;
          applicableCategory?: string | null;
          maxDiscount?: number | null;
        };
        const scopedIds = Array.isArray(c.applicableTourIds)
          ? (c.applicableTourIds as unknown[]).filter((x): x is string => typeof x === 'string')
          : [];
        const usable =
          freshCoupon.active &&
          (!c.startsAt || c.startsAt.getTime() <= Date.now()) &&
          freshCoupon.expiresAt.getTime() >= Date.now() &&
          subtotal >= freshCoupon.minOrder &&
          (freshCoupon.usageLimit === null || freshCoupon.usedCount - occupiedBySelf < freshCoupon.usageLimit) &&
          ((c.minGuests ?? 0) <= 0 || newCount >= (c.minGuests ?? 0)) &&
          (scopedIds.length === 0 || scopedIds.includes(booking.tourId)) &&
          (!c.applicableCategory || c.applicableCategory === (tour as { category?: string }).category);
        if (!usable) {
          couponId = null;
          discount = 0;
        } else {
          let raw =
            freshCoupon.type === 'PERCENT' ? Math.floor((subtotal * freshCoupon.value) / 100) : freshCoupon.value;
          if (freshCoupon.type === 'PERCENT' && c.maxDiscount != null && c.maxDiscount > 0) {
            raw = Math.min(raw, c.maxDiscount);
          }
          couponId = freshCoupon.id;
          discount = Math.min(raw, subtotal);
        }
      }
    }
    const loyaltyKept = booking.loyaltyUsed ?? 0;
    // Clamp kept points to the new fare (shrinking the party must not push
    // the discount past the 20% cap on the new subtotal).
    let loyaltyDiscount = 0;
    if (loyaltyKept > 0) {
      const { loyaltyDiscountFor } = await import('./loyalty.service.js');
      loyaltyDiscount = Math.min(
        loyaltyKept * 1000,
        loyaltyDiscountFor(loyaltyKept, Math.max(0, subtotal - discount)),
      );
    }
    // Combo legs keep their percent-off (recomputed on the new subtotal).
    let comboDiscount = 0;
    if (booking.comboId) {
      const combo = await tx.combo.findUnique({ where: { id: booking.comboId } });
      const pct = Math.min(90, Math.max(0, combo?.discountPercent ?? 0));
      if (pct > 0) comboDiscount = Math.floor((subtotal * pct) / 100);
      discount = Math.min(subtotal, discount + comboDiscount);
    }
    const privateSurcharge = booking.isPrivate ? booking.privateSurcharge : 0;
    const total = Math.max(0, subtotal - discount - loyaltyDiscount + fare.addonsTotal + privateSurcharge);
    const vatAmount = booking.vatName || booking.vatTaxCode ? computeVat(total) : 0;

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
        customerEmail: input.customerEmail ? input.customerEmail.trim().toLowerCase() : booking.customerEmail,
        customerPhone: input.customerPhone?.trim() || booking.customerPhone,
        note: input.note === undefined ? booking.note : input.note?.trim() || null,
        subtotal,
        discount,
        total,
        loyaltyUsed: loyaltyKept,
        loyaltyDiscount,
        vatAmount,
        adultUnitPrice: editUnits.price,
        childUnitPrice: editUnits.childPrice,
        couponId,
      },
    });
    // travelDate/guests feed the ticket HMAC — re-sign so saved QRs stay valid.
    const { signTicket } = await import('../utils/ticket.js');
    const ticketSignature = signTicket({
      code: updated.bookingCode,
      travelDateISO: newTravelDate.toISOString(),
      guests: newCount,
    });
    await tx.booking.update({ where: { id: bookingId }, data: { ticketSignature } });

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
          email: g.email ? g.email.trim().toLowerCase() : null,
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

export async function cancelBooking(bookingId: string, userId: string, isAdmin: boolean, reason?: string) {
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
    // Serialize concurrent cancels: lock the booking row first and re-check
    // status inside the tx (the pre-check outside can't prevent a double-cancel).
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
    const fresh = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true },
    });
    if (!fresh) throw new AppError(404, 'Booking not found');
    if (fresh.bookingStatus === 'CANCELLED') throw new AppError(400, 'Booking already cancelled');
    if (fresh.bookingStatus === 'COMPLETED') throw new AppError(400, 'Completed booking cannot be cancelled');
    // Expired-hold path must re-check inside the tx: payment could have turned
    // PAID/AWAITING between the sweeper scan and here — never cancel a paid hold.
    // FAILED never captured money, so an expired FAILED hold releases too.
    if (reason === 'EXPIRED') {
      const holdPast = fresh.holdExpiresAt != null && fresh.holdExpiresAt.getTime() < Date.now();
      if (!holdPast) throw new AppError(400, 'Hold no longer expired');
      if (fresh.payment && fresh.payment.status !== 'PENDING' && fresh.payment.status !== 'FAILED') {
        throw new AppError(400, 'Hold no longer expired');
      }
    }
    // Lock every row this cancel touches so concurrent create/cancel/admin
    // actions serialize instead of double-restoring seats or coupon quota.
    // Use the locked `fresh` row throughout — the outer `booking` may be stale
    // if an edit landed between the pre-check and this transaction.
    const cancelDay = toCalendarDay(fresh.travelDate);
    await tx.$queryRaw`SELECT "id" FROM "Tour" WHERE "id" = ${fresh.tourId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "TourDate" WHERE "tourId" = ${fresh.tourId} AND "date" = ${cancelDay} FOR UPDATE`;
    if (fresh.couponId) {
      await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "id" = ${fresh.couponId} FOR UPDATE`;
    }
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { bookingStatus: 'CANCELLED', cancelReason: reason ?? null, holdExpiresAt: null },
    });
    // Restore seats.
    await tx.tour.update({
      where: { id: fresh.tourId },
      data: { availableSeats: { increment: fresh.guests } },
    });
    // Release the per-date bucket (if the travel day is managed).
    const cancelRow = await tx.tourDate.findUnique({
      where: { tourId_date: { tourId: fresh.tourId, date: cancelDay } },
    });
    if (cancelRow && cancelRow.booked > 0) {
      await tx.tourDate.update({
        where: { id: cancelRow.id },
        data: { booked: Math.max(0, cancelRow.booked - fresh.guests) },
      });
    }
    // Give the coupon quota back (a cancelled booking must not consume it).
    if (fresh.couponId) {
      await tx.coupon.updateMany({
        where: { id: fresh.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
    }
    // If money was captured, mark refunded; PENDING stays PENDING. A transfer
    // reported but never verified (AWAITING_CONFIRMATION) also goes back to
    // PENDING — nothing was captured in our books.
    if (fresh.payment?.status === 'PAID') {
      await tx.payment.update({ where: { bookingId }, data: { status: 'REFUNDED' } });
    } else if (fresh.payment?.status === 'AWAITING_CONFIRMATION') {
      await tx.payment.update({ where: { bookingId }, data: { status: 'PENDING' } });
    }
    // Refund redeemed loyalty points so a cancelled booking never burns them.
    if (fresh.loyaltyUsed > 0) {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${fresh.userId} FOR UPDATE`;
      await tx.user.update({ where: { id: fresh.userId }, data: { loyaltyPoints: { increment: fresh.loyaltyUsed } } });
      await tx.loyaltyTransaction.create({
        data: { userId: fresh.userId, points: fresh.loyaltyUsed, type: 'REFUND', bookingId },
      });
    }
    return updated;
  });
}

/**
 * Book a combo: one booking per tour leg, same party/date/contact, sharing a
 * comboGroup. Combo percent applies to every leg; coupon/loyalty only to the
 * first leg. On leg failure, created legs are cancelled (best-effort).
 */
export async function bookCombo(
  combo: { id: string; tourIds: string[]; discountPercent: number },
  input: Omit<CreateBookingInput, 'tourId' | 'comboId' | 'comboGroup' | 'comboDiscountPercent'>,
) {
  if (combo.tourIds.length < 2) throw new AppError(400, 'Combo must include at least 2 tours');
  // Validate every leg upfront: one price/availability surprise must fail the
  // whole combo BEFORE leg 1 holds seats (cheaper than rollback).
  const legs = await prisma.tour.findMany({ where: { id: { in: combo.tourIds } } });
  const legById = new Map(legs.map((t) => [t.id, t]));
  for (const tourId of combo.tourIds) {
    const leg = legById.get(tourId);
    if (!leg || leg.status !== 'ACTIVE') throw new AppError(400, 'Combo contains unavailable tour');
    const legPriv = leg as typeof leg & { privateAvailable?: boolean };
    if (input.isPrivate === true && !legPriv.privateAvailable) {
      throw new AppError(400, 'Private tour is not available');
    }
  }
  const wantedAddons = [...new Set((input.addons ?? []).map((s) => s.trim()).filter(Boolean))];
  if (wantedAddons.length > 0) {
    for (const tourId of combo.tourIds) {
      const leg = legById.get(tourId)!;
      const catalog = new Set(parseTourAddons(leg.addons).map((a) => a.id));
      const missing = wantedAddons.find((id) => !catalog.has(id));
      if (missing) throw new AppError(400, 'Selected add-ons are invalid');
    }
  }
  const group = `CG-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4)
    .toString()
    .padStart(4, '0')}`;
  const created: Array<{ id: string; bookingCode: string }> = [];
  try {
    for (let i = 0; i < combo.tourIds.length; i += 1) {
      const full = await createBooking({
        ...input,
        tourId: combo.tourIds[i],
        comboId: combo.id,
        comboGroup: group,
        comboDiscountPercent: combo.discountPercent,
        // Coupon/loyalty stack once (first leg) — legs share one trip budget.
        couponCode: i === 0 ? input.couponCode : undefined,
        loyaltyPoints: i === 0 ? input.loyaltyPoints : 0,
      });
      if (!full) throw new AppError(500, 'Combo booking failed');
      created.push({ id: full.id, bookingCode: full.bookingCode });
    }
  } catch (err) {
    for (const c of created) {
      try {
        await cancelBooking(c.id, input.userId, true, 'COMBO_ROLLBACK');
      } catch {
        /* best-effort */
      }
    }
    throw err;
  }
  return { group, bookings: created };
}

/**
 * Auto-release expired holds: CONFIRMED/PENDING bookings whose holdExpiresAt
 * passed while payment is still PENDING are cancelled (reason EXPIRED),
 * restoring seats/coupon/loyalty exactly like a user cancel.
 * Idempotent: re-running skips already-cancelled rows.
 */
export async function releaseExpiredHolds(limit = 100): Promise<{ released: number }> {
  const due = await prisma.booking.findMany({
    where: {
      bookingStatus: { in: ['PENDING', 'CONFIRMED'] },
      holdExpiresAt: { lt: new Date() },
      payment: { status: { in: ['PENDING', 'FAILED'] } },
    },
    select: { id: true, userId: true },
    orderBy: { holdExpiresAt: 'asc' },
    take: Math.min(200, Math.max(1, limit)),
  });
  let released = 0;
  for (const b of due) {
    try {
      await cancelBooking(b.id, b.userId, true, 'EXPIRED');
      released += 1;
    } catch (err) {
      // Already-cancelled/completed races are expected — only log real errors.
      if (err instanceof AppError && err.statusCode === 400) continue;
      console.error(`hold release failed for ${b.id}:`, err);
    }
  }
  return { released };
}
