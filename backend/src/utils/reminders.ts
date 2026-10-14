import { prisma } from '../config/env.js';
import { bookingReminderMail, isMailConfigured, reviewInviteMail, sendMail } from './mailer.js';

const HOUR_MS = 60 * 60 * 1000;
// Vietnam wall-clock day (UTC+7) expressed as a UTC range: a booking "tomorrow
// in VN" is what matters for reminders, not UTC midnight boundaries.
const VN_OFFSET_MS = 7 * HOUR_MS;

function vnDayBounds(offsetDays: number): { start: Date; end: Date } {
  const nowVn = Date.now() + VN_OFFSET_MS;
  const d = new Date(nowVn);
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + offsetDays * 86400000 - VN_OFFSET_MS;
  return { start: new Date(base), end: new Date(base + 86400000 - 1) };
}

async function sendReminders(): Promise<void> {
  // Tour khởi hành NGÀY MAI (giờ VN), còn hiệu lực, chưa gửi nhắc.
  const { start, end } = vnDayBounds(1);
  const due = await prisma.booking.findMany({
    where: {
      bookingStatus: { in: ['PENDING', 'CONFIRMED'] },
      reminderSentAt: null,
      travelDate: { gte: start, lte: end },
    },
    include: { tour: { select: { title: true } } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  for (const b of due) {
    // Claim atomically first: multi-instance/hourly overlap must not double-send.
    // Only the instance whose updateMany matches (still null) proceeds to mail.
    const claimed = await prisma.booking.updateMany({
      where: { id: b.id, reminderSentAt: null },
      data: { reminderSentAt: new Date() },
    });
    if (claimed.count === 0) continue;
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
    } catch (err) {
      // Mail failed after claim: reset flag so a later tick retries instead of
      // silently dropping the reminder.
      await prisma.booking.updateMany({
        where: { id: b.id },
        data: { reminderSentAt: null },
      });
      console.error(`reminder mail failed for ${b.bookingCode}:`, err);
    }
  }
}

async function sendReviewInvites(): Promise<void> {
  // Tour đã đi (travelDate qua, tính theo ngày VN) + COMPLETED trong 14 ngày qua,
  // chưa mời review, chưa có review.
  const nowVnEnd = vnDayBounds(0).start; // 00:00 VN hôm nay (UTC)
  const since = new Date(Date.now() - 14 * 86400000);
  const done = await prisma.booking.findMany({
    where: {
      bookingStatus: 'COMPLETED',
      reviewInviteSentAt: null,
      updatedAt: { gte: since },
      travelDate: { lt: nowVnEnd },
    },
    include: { tour: { select: { title: true } } },
    orderBy: { updatedAt: 'asc' },
    take: 200,
  });
  for (const b of done) {
    const reviewed = await prisma.review.findUnique({ where: { bookingId: b.id } });
    if (reviewed) {
      await prisma.booking.updateMany({
        where: { id: b.id, reviewInviteSentAt: null },
        data: { reviewInviteSentAt: new Date() },
      });
      continue;
    }
    const claimed = await prisma.booking.updateMany({
      where: { id: b.id, reviewInviteSentAt: null },
      data: { reviewInviteSentAt: new Date() },
    });
    if (claimed.count === 0) continue;
    try {
      const { subject, text } = reviewInviteMail({
        bookingCode: b.bookingCode,
        tourTitle: b.tour?.title ?? b.tourId,
        travelDate: b.travelDate,
        guests: b.guests,
        total: b.total,
        customerName: b.customerName,
      });
      await sendMail(b.customerEmail, subject, text);
    } catch (err) {
      await prisma.booking.updateMany({
        where: { id: b.id },
        data: { reviewInviteSentAt: null },
      });
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
