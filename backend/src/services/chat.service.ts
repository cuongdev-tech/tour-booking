import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';

export async function assertThreadAccess(bookingId: string, userId: string, isAdmin: boolean) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError(404, 'Booking not found');
  if (!isAdmin && booking.userId !== userId) throw new AppError(403, 'Access denied');
  return booking;
}

export async function listMessages(bookingId: string, userId: string, isAdmin: boolean) {
  await assertThreadAccess(bookingId, userId, isAdmin);
  // Newest 200 in chronological order (long threads keep recent history).
  const rows = await prisma.bookingMessage.findMany({
    where: { bookingId },
    include: { sender: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.reverse();
}

export async function sendMessage(
  bookingId: string,
  senderId: string,
  role: 'CUSTOMER' | 'ADMIN',
  body: string,
) {
  const text = body.trim();
  if (text.length < 1 || text.length > 2000) throw new AppError(400, 'Message must be 1-2000 characters');
  await assertThreadAccess(bookingId, senderId, role === 'ADMIN');
  return prisma.bookingMessage.create({
    data: { bookingId, senderId, senderRole: role, body: text },
    include: { sender: { select: { id: true, name: true } } },
  });
}

export async function adminThreads() {
  const groups = await prisma.bookingMessage.groupBy({
    by: ['bookingId'],
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
    take: 30,
  });
  if (groups.length === 0) return [];
  const ids = groups.map((g) => g.bookingId);
  const [bookings, latest] = await Promise.all([
    prisma.booking.findMany({
      where: { id: { in: ids } },
      include: {
        tour: { select: { id: true, title: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    Promise.all(
      ids.map((bookingId) =>
        prisma.bookingMessage.findFirst({
          where: { bookingId },
          orderBy: { createdAt: 'desc' },
          include: { sender: { select: { id: true, name: true } } },
        }),
      ),
    ),
  ]);
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const lastByBooking = new Map<string, (typeof latest)[number]>();
  for (const m of latest) {
    if (m) lastByBooking.set(m.bookingId, m);
  }
  return groups
    .map((g) => {
      const booking = byId.get(g.bookingId);
      if (!booking) return null;
      return {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        lastAt: g._max.createdAt,
        lastMessage: lastByBooking.get(g.bookingId) ?? null,
        tour: booking.tour,
        customer: booking.user,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
}
