import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';

export async function listQuestions(tourId: string, page?: unknown, limit?: unknown) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId }, select: { id: true } });
  if (!tour) throw new AppError(404, 'Tour not found');
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const l = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)));
  const where = { tourId, hidden: false };
  const [total, data] = await Promise.all([
    prisma.tourQuestion.count({ where }),
    prisma.tourQuestion.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return { data, pagination: { page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l)) } };
}

export async function askQuestion(tourId: string, userId: string, question: string) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId }, select: { status: true } });
  if (!tour) throw new AppError(404, 'Tour not found');
  if (tour.status !== 'ACTIVE') throw new AppError(400, 'Tour is not available');
  const text = question.trim();
  if (text.length < 5 || text.length > 1000) throw new AppError(400, 'Question must be 5-1000 characters');
  return prisma.tourQuestion.create({
    data: { tourId, userId, question: text },
    include: { user: { select: { id: true, name: true } } },
  });
}

export async function adminAnswer(id: string, answer: string | null) {
  const row = await prisma.tourQuestion.findUnique({ where: { id } });
  if (!row) throw new AppError(404, 'Question not found');
  if (answer === null) {
    return prisma.tourQuestion.update({ where: { id }, data: { answer: null, answeredAt: null } });
  }
  const text = answer.trim();
  if (text.length < 1 || text.length > 2000) throw new AppError(400, 'Answer must be 1-2000 characters');
  return prisma.tourQuestion.update({ where: { id }, data: { answer: text, answeredAt: new Date() } });
}

export async function adminHide(id: string, hidden: boolean) {
  const row = await prisma.tourQuestion.findUnique({ where: { id } });
  if (!row) throw new AppError(404, 'Question not found');
  return prisma.tourQuestion.update({ where: { id }, data: { hidden } });
}

export async function adminDelete(id: string) {
  const row = await prisma.tourQuestion.findUnique({ where: { id } });
  if (!row) throw new AppError(404, 'Question not found');
  await prisma.tourQuestion.delete({ where: { id } });
  return { success: true };
}
