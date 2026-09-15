import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';

export function getTourReviews(tourId: string) {
  return prisma.review.findMany({
    where: { tourId },
    include: { user: { select: { id: true, name: true, avatar: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function createReview(userId: string, bookingId: string, rating: number, comment?: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError(404, 'Booking not found');
  if (booking.userId !== userId) throw new AppError(403, 'Not your booking');
  if (booking.bookingStatus !== 'COMPLETED')
    throw new AppError(400, 'Only completed bookings can be reviewed');

  const existing = await prisma.review.findUnique({ where: { bookingId } });
  if (existing) throw new AppError(409, 'This booking has already been reviewed');

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        userId,
        tourId: booking.tourId,
        bookingId,
        rating,
        comment: comment?.trim() || null,
      },
    });
    const agg = await tx.review.aggregate({
      where: { tourId: booking.tourId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await tx.tour.update({
      where: { id: booking.tourId },
      data: { rating: agg._avg.rating ?? rating, reviewCount: agg._count.rating },
    });
    return created;
  });

  return review;
}
