import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';
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
