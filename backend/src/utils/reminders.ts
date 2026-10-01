import { prisma } from '../config/env.js';
import { bookingReminderMail, isMailConfigured, reviewInviteMail, sendMail } from './mailer.js';

const HOUR_MS = 60 * 60 * 1000;

function utcDayBounds(offsetDays: number): { start: Date; end: Date } {
  const now = new Date();
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + offsetDays * 86400000;
  return { start: new Date(base), end: new Date(base + 86400000 - 1) };
}

async function sendReminders(): Promise<void> {
  // Tour khởi hành NGÀY MAI, còn hiệu lực, chưa gửi nhắc.
  const { start, end } = utcDayBounds(1);
  const due = await prisma.booking.findMany({
    where: {
      bookingStatus: { in: ['PENDING', 'CONFIRMED'] },
      reminderSentAt: null,
      travelDate: { gte: start, lte: end },
    },
    include: { tour: { select: { title: true } } },
    take: 200,
  });
  for (const b of due) {
    try {
      const { subject, text } = bookingReminderMail({
        bookingCode: b.bookingCode,
        tourTitle: b.tour?.title ?? b.tourId,
        travelDate: b.travelDate,
        guests: b.guests,
        total: b.total,
        customerName: b.customerName,
      });
      await sendMail(b.customerEmail, subject, text);
      await prisma.booking.update({ where: { id: b.id }, data: { reminderSentAt: new Date() } });
    } catch (err) {
      console.error(`reminder mail failed for ${b.bookingCode}:`, err);
    }
  }
}

async function sendReviewInvites(): Promise<void> {
  // Tour đã COMPLETED trong 14 ngày qua, chưa mời review, chưa có review.
  const now = new Date();
  const since = new Date(now.getTime() - 14 * 86400000);
  const done = await prisma.booking.findMany({
    where: { bookingStatus: 'COMPLETED', reviewInviteSentAt: null, updatedAt: { gte: since } },
    include: { tour: { select: { title: true } } },
    take: 200,
  });
  for (const b of done) {
    try {
      const reviewed = await prisma.review.findUnique({ where: { bookingId: b.id } });
      if (reviewed) {
        await prisma.booking.update({ where: { id: b.id }, data: { reviewInviteSentAt: new Date() } });
        continue;
      }
      const { subject, text } = reviewInviteMail({
        bookingCode: b.bookingCode,
        tourTitle: b.tour?.title ?? b.tourId,
        travelDate: b.travelDate,
        guests: b.guests,
        total: b.total,
        customerName: b.customerName,
      });
      await sendMail(b.customerEmail, subject, text);
      await prisma.booking.update({ where: { id: b.id }, data: { reviewInviteSentAt: new Date() } });
    } catch (err) {
      console.error(`review invite mail failed for ${b.bookingCode}:`, err);
    }
  }
}

/**
 * Scheduler email tự động (nhắc trước tour + mời review).
 * Chạy trong tiến trình API, mỗi giờ 1 lần, flag DB chống gửi trùng.
 * Không cấu hình SMTP thì tự bỏ qua.
 */
export function startBookingReminders(): void {
  if (!isMailConfigured()) {
    console.log('Booking reminders disabled (SMTP not configured)');
    return;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sendReminders();
      await sendReviewInvites();
    } catch (err) {
      console.error('booking reminder tick failed:', err);
    } finally {
      running = false;
    }
  };
  // Chạy lần đầu sau 30s (đợi DB sẵn sàng), sau đó mỗi giờ.
  setTimeout(() => void tick(), 30_000).unref?.();
  setInterval(() => void tick(), HOUR_MS).unref?.();
  console.log('Booking reminders enabled (hourly)');
}
