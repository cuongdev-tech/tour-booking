import { prisma } from '../config/env.js';
import { AppError, generateBookingCode, generateTransactionCode } from '../utils/helpers.js';
import { resolveCoupon } from './coupon.service.js';

interface GuestInput {
  fullName: string;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
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

    // Backend-calculated pricing — never trust frontend subtotal/discount/total.
    const subtotal = freshTour.price * guestCount;
    const { couponId, discount } = await resolveCoupon(input.couponCode, subtotal, tx);
    const total = subtotal - discount;

    const created = await tx.booking.create({
      data: {
        bookingCode,
        userId: input.userId,
        tourId: tour.id,
        couponId,
        travelDate,
        guests: guestCount,
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

  return prisma.booking.findUnique({
    where: { id: booking.id },
    include: { tour: true, guestsList: true, payment: true, coupon: true },
  });
}

export function getMyBookings(userId: string) {
  return prisma.booking.findMany({
    where: { userId },
    include: { tour: true, payment: true, coupon: true },
    orderBy: { createdAt: 'desc' },
  });
}

export function getBookingByCode(bookingCode: string, userId: string, isAdmin: boolean) {
  return prisma.booking.findFirst({
    where: { bookingCode, ...(isAdmin ? {} : { userId }) },
    include: { tour: true, guestsList: true, payment: true, coupon: true },
  });
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

  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { bookingStatus: 'CANCELLED' },
    });
    // Restore seats.
    await tx.tour.update({
      where: { id: booking.tourId },
      data: { availableSeats: { increment: booking.guests } },
    });
    // If money was captured, mark refunded; PENDING stays PENDING.
    if (booking.payment?.status === 'PAID') {
      await tx.payment.update({ where: { bookingId }, data: { status: 'REFUNDED' } });
    }
    return updated;
  });
}
