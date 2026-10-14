import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';
import { isMailConfigured, sendMail } from '../utils/mailer.js';
import { matchTextIds } from './tour.service.js';

export async function createContactMessage(data: { name: string; email: string; phone?: string; message: string }) {
  return prisma.contactMessage.create({
    data: {
      name: data.name.trim(),
      email: data.email.toLowerCase(),
      phone: data.phone?.trim() || null,
      message: data.message.trim(),
    },
  });
}

export async function adminListContactMessages(page?: unknown, limit?: unknown, unreadOnly?: boolean, q?: string) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const l = Math.min(50, Math.max(1, Math.floor(Number(limit) || 10)));
  let idFilter: { id: { in: string[] } } | undefined;
  if (q?.trim()) {
    const [byName, byEmail, byMessage] = await Promise.all([
      matchTextIds('ContactMessage', 'name', q),
      matchTextIds('ContactMessage', 'email', q),
      matchTextIds('ContactMessage', 'message', q),
    ]);
    idFilter = { id: { in: [...new Set([...byName, ...byEmail, ...byMessage])] } };
  }
  const where = { ...(unreadOnly ? { isRead: false } : {}), ...idFilter };
  const [total, messages] = await Promise.all([
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.findMany({ where, skip: (p - 1) * l, take: l, orderBy: { createdAt: 'desc' } }),
  ]);
  const unread = await prisma.contactMessage.count({ where: { isRead: false, ...idFilter } });
  return {
    data: messages,
    pagination: { page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l)) },
    unread,
  };
}

export async function adminSetContactRead(id: string, isRead: boolean) {
  const row = await prisma.contactMessage.findUnique({ where: { id } });
  if (!row) throw new AppError(404, 'Resource not found');
  return prisma.contactMessage.update({ where: { id }, data: { isRead } });
}

export async function adminDeleteContactMessage(id: string) {
  const row = await prisma.contactMessage.findUnique({ where: { id } });
  if (!row) throw new AppError(404, 'Resource not found');
  await prisma.contactMessage.delete({ where: { id } });
  return { success: true };
}

export async function adminReplyContact(id: string, reply: string) {
  const row = await prisma.contactMessage.findUnique({ where: { id } });
  if (!row) throw new AppError(404, 'Resource not found');
  const text = reply.trim();
  if (!text) throw new AppError(400, 'Reply must not be empty');
  if (text.length > 2000) throw new AppError(400, 'Reply is too long');
  const updated = await prisma.contactMessage.update({
    where: { id },
    data: { adminReply: text, adminRepliedAt: new Date(), isRead: true },
  });
  // Trả lời qua email khi cấu hình SMTP (best-effort: mail lỗi không làm hỏng reply).
  if (isMailConfigured()) {
    try {
      await sendMail(
        row.email,
        `Tour Booking - Phản hồi tin nhắn của ${row.name}`,
        `Xin chào ${row.name},\n\nCảm ơn bạn đã liên hệ Tour Booking.\n\nTin nhắn của bạn: ${row.message}\n\nPhản hồi của chúng tôi: ${text}\n\nTrân trọng,\nTour Booking`,
      );
    } catch (err) {
      console.error('contact reply mail failed:', err);
    }
  }
  return updated;
}

export async function adminDeleteContactReply(id: string) {
  const row = await prisma.contactMessage.findUnique({ where: { id } });
  if (!row) throw new AppError(404, 'Resource not found');
  return prisma.contactMessage.update({
    where: { id },
    data: { adminReply: null, adminRepliedAt: null },
  });
}
