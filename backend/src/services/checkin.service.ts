import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';
import { verifyTicket } from '../utils/ticket.js';
import { getPublicTicket } from './booking.service.js';

/**
 * Public QR verification: recompute the HMAC from the stored travelDate +
 * guests and compare with the `t` query param (constant-time).
 */
export async function verifyTicketPayload(code: string, sig: string) {
  const booking = await prisma.booking.findUnique({ where: { bookingCode: code } });
  if (!booking) throw new AppError(404, 'Booking not found');
  const travelDateISO = booking.travelDate.toISOString();
  const signatureValid = verifyTicket(booking.bookingCode, travelDateISO, booking.guests, sig);
  const ticket = await getPublicTicket(code);
  if (!ticket) throw new AppError(404, 'Booking not found');
  return { ticket, signatureValid, checkedInAt: booking.checkedInAt };
}

/**
 * Staff check-in at departure. Only CONFIRMED/PENDING bookings with a PAID
 * payment (or CASH still PENDING, settled on site) can be checked in.
 * Idempotent: an already-checked-in booking is returned unchanged with no
 * extra log row. When the scanned QR signature is provided it must verify.
 */
export async function staffCheckin(bookingCode: string, staffName: string, sig?: string) {
  const booking = await prisma.booking.findUnique({
    where: { bookingCode },
    include: { payment: true },
  });
  if (!booking) throw new AppError(404, 'Booking not found');
  if (booking.bookingStatus !== 'PENDING' && booking.bookingStatus !== 'CONFIRMED') {
    throw new AppError(400, 'Booking cannot be checked in');
  }
  const pay = booking.payment;
  if (!pay || (pay.status !== 'PAID' && !(pay.method === 'CASH' && pay.status === 'PENDING'))) {
    throw new AppError(400, 'Payment not completed');
  }
  if (sig && !verifyTicket(booking.bookingCode, booking.travelDate.toISOString(), booking.guests, sig)) {
    throw new AppError(400, 'Ticket signature is invalid');
  }
  if (booking.checkedInAt) return booking;
  return prisma.$transaction(async (tx) => {
    // Serialize concurrent scans of the same QR (no double log rows).
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${booking.id} FOR UPDATE`;
    const fresh = await tx.booking.findUnique({ where: { id: booking.id } });
    if (!fresh) throw new AppError(404, 'Booking not found');
    if (fresh.checkedInAt) return fresh;
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { checkedInAt: new Date(), checkedInBy: staffName },
    });
    await tx.checkInLog.create({ data: { bookingId: booking.id, method: sig ? 'QR' : 'MANUAL', by: staffName } });
    return updated;
  });
}

/** Departure manifest: live bookings whose travelDate falls on the given VN day. */
export async function manifest(dateISO?: string, tourId?: string) {
  let base: Date;
  if (dateISO === undefined || dateISO === '') {
    base = new Date();
  } else {
    base = new Date(dateISO);
    if (Number.isNaN(base.getTime())) throw new AppError(400, 'Invalid travel date');
  }
  // VN wall-clock day expressed in UTC (staff work in Asia/Ho_Chi_Minh).
  const VN_OFFSET_MS = 7 * 3600_000;
  const vnMidnight = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()) - VN_OFFSET_MS;
  const start = new Date(vnMidnight);
  const end = new Date(vnMidnight + 86400000);
  return prisma.booking.findMany({
    where: {
      travelDate: { gte: start, lt: end },
      bookingStatus: { in: ['PENDING', 'CONFIRMED'] },
      ...(tourId ? { tourId } : {}),
    },
    include: {
      tour: { select: { id: true, title: true, destination: true } },
      payment: true,
      checkins: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  });
}
