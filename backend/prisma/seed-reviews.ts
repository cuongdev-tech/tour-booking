/**
 * Seed demo reviews để test tay màn Duyệt đánh giá (tabs Tất cả/Chờ duyệt/Hiện/Ẩn).
 * Idempotent: chỉ tạo cho booking COMPLETED chưa có review, chạy lại không trùng.
 *
 *   npm run prisma:seed:reviews   (chạy từ backend/)
 */
import { prisma } from '../src/config/env.js';

async function recomputeTour(tourId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { tourId, hidden: false },
    _avg: { rating: true },
    _count: { rating: true },
  });
  await prisma.tour.update({
    where: { id: tourId },
    data: { rating: agg._avg.rating ?? 0, reviewCount: agg._count.rating },
  });
}

const candidates = await prisma.booking.findMany({
  where: { bookingStatus: 'COMPLETED', reviews: { none: {} } },
  select: { id: true, bookingCode: true, userId: true, tourId: true, travelDate: true },
  orderBy: { travelDate: 'asc' },
});

if (candidates.length === 0) {
  console.log('Không có booking COMPLETED nào chưa review — bỏ qua.');
  await prisma.$disconnect();
  process.exit(0);
}

// Chỉ review được chuyến đã đi qua (giống rule createReview).
const now = Date.now();
const eligible = candidates.filter((b) => b.travelDate.getTime() <= now);
if (eligible.length === 0) {
  console.log('Booking COMPLETED nhưng chưa qua ngày đi — bỏ qua.');
  await prisma.$disconnect();
  process.exit(0);
}

const demos = [
  {
    rating: 5,
    comment: 'Hạ Long đẹp ngoài mong đợi, hướng dẫn viên nhiệt tình, đồ ăn ngon. Sẽ quay lại!',
    hidden: false,
    adminReply: null as string | null,
  },
  {
    rating: 4,
    comment: 'Tour ổn, xe đón đúng giờ. Trừ 1 sao vì lịch hơi gấp buổi chiều.',
    hidden: true,
    adminReply: 'Cảm ơn góp ý của bạn, shop sẽ giãn lịch buổi chiều cho đoàn sau.',
  },
];

for (let i = 0; i < Math.min(eligible.length, demos.length); i += 1) {
  const b = eligible[i];
  const d = demos[i];
  await prisma.review.create({
    data: {
      userId: b.userId,
      tourId: b.tourId,
      bookingId: b.id,
      rating: d.rating,
      comment: d.comment,
      images: [],
      hidden: d.hidden,
      adminReply: d.adminReply,
      adminRepliedAt: d.adminReply ? new Date() : null,
    },
  });
  await recomputeTour(b.tourId);
  console.log(`+ review ${d.rating}★ booking ${b.bookingCode} (hidden=${d.hidden}, replied=${d.adminReply !== null})`);
}

await prisma.$disconnect();
