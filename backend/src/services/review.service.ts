import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';

export function getTourReviews(tourId: string) {
  return prisma.review.findMany({
    where: { tourId, hidden: false },
    include: { user: { select: { id: true, name: true, avatar: true } } },
    orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
    take: 50,
  });
}

export function getMyReviews(userId: string) {
  return prisma.review.findMany({
    where: { userId },
    include: { tour: { select: { id: true, title: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateReview(
  userId: string,
  reviewId: string,
  data: { rating?: number; comment?: string; images?: string[] },
) {
  const existing = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!existing) throw new AppError(404, 'Review not found');
  if (existing.userId !== userId) throw new AppError(403, 'Not your booking');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.review.update({
      where: { id: reviewId },
      data: {
        ...(data.rating !== undefined ? { rating: data.rating } : {}),
        ...(data.comment !== undefined ? { comment: data.comment?.trim() || null } : {}),
        ...(data.images !== undefined ? { images: data.images } : {}),
      },
    });
    const agg = await tx.review.aggregate({
      where: { tourId: existing.tourId, hidden: false },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await tx.tour.update({
      where: { id: existing.tourId },
      data: { rating: agg._avg.rating ?? 0, reviewCount: agg._count.rating },
    });
    return updated;
  });
}

export async function deleteReview(userId: string, reviewId: string) {
  const existing = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!existing) throw new AppError(404, 'Review not found');
  if (existing.userId !== userId) throw new AppError(403, 'Not your booking');
  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: reviewId } });
    const agg = await tx.review.aggregate({
      where: { tourId: existing.tourId, hidden: false },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await tx.tour.update({
      where: { id: existing.tourId },
      data: { rating: agg._avg.rating ?? 0, reviewCount: agg._count.rating },
    });
  });
  return { success: true };
}

export async function createReview(userId: string, bookingId: string, rating: number, comment?: string, images: string[] = []) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError(404, 'Booking not found');
  if (booking.userId !== userId) throw new AppError(403, 'Not your booking');
  if (booking.bookingStatus !== 'COMPLETED')
    throw new AppError(400, 'Only completed bookings can be reviewed');
  // COMPLETED alone is not enough (an admin could complete a future tour):
  // the travel day itself must have passed.
  if (booking.travelDate.getTime() > Date.now())
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
        images,
      },
    });
    const agg = await tx.review.aggregate({
      where: { tourId: booking.tourId, hidden: false },
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

export async function toggleHelpful(userId: string, reviewId: string) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review || review.hidden) throw new AppError(404, 'Review not found');
  if (review.userId === userId) throw new AppError(400, 'Cannot vote your own review');
  return prisma.$transaction(async (tx) => {
    const existing = await tx.reviewVote.findUnique({
      where: { userId_reviewId: { userId, reviewId } },
    });
    if (existing) {
      await tx.reviewVote.delete({ where: { id: existing.id } });
      const updated = await tx.review.update({
        where: { id: reviewId },
        data: { helpfulCount: { decrement: 1 } },
      });
      // Counter can never go negative (concurrent toggles clamp at 0).
      if (updated.helpfulCount < 0) {
        await tx.review.update({ where: { id: reviewId }, data: { helpfulCount: 0 } });
        return { voted: false, helpfulCount: 0 };
      }
      return { voted: false, helpfulCount: updated.helpfulCount };
    }
    await tx.reviewVote.create({ data: { userId, reviewId } });
    const updated = await tx.review.update({
      where: { id: reviewId },
      data: { helpfulCount: { increment: 1 } },
    });
    return { voted: true, helpfulCount: updated.helpfulCount };
  });
}

export function adminListReviews(page?: unknown, limit?: unknown, hidden?: boolean) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const l = Math.min(50, Math.max(1, Math.floor(Number(limit) || 10)));
  const where = hidden === undefined ? {} : { hidden };
  return Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      skip: (p - 1) * l,
      take: l,
      include: {
        user: { select: { id: true, name: true, email: true } },
        tour: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]).then(([total, data]) => ({
    data,
    pagination: { page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l)) },
  }));
}

export async function adminSetReviewHidden(id: string, hidden: boolean) {
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) throw new AppError(404, 'Review not found');
  if (review.hidden === hidden) return review;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.review.update({ where: { id }, data: { hidden } });
    // A hidden review must stop counting toward the tour's public rating.
    const agg = await tx.review.aggregate({
      where: { tourId: review.tourId, hidden: false },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await tx.tour.update({
      where: { id: review.tourId },
      data: { rating: agg._avg.rating ?? 0, reviewCount: agg._count.rating },
    });
    return updated;
  });
}

export async function adminDeleteReview(id: string) {
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) throw new AppError(404, 'Review not found');
  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id } });
    // Recompute the tour aggregate so a removed review stops counting.
    const agg = await tx.review.aggregate({
      where: { tourId: review.tourId, hidden: false },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await tx.tour.update({
      where: { id: review.tourId },
      data: { rating: agg._avg.rating ?? 0, reviewCount: agg._count.rating },
    });
  });
  return { success: true };
}
