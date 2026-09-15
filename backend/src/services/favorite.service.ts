import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';

export function getFavorites(userId: string) {
  return prisma.favorite.findMany({
    where: { userId },
    include: { tour: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function addFavorite(userId: string, tourId: string) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId } });
  if (!tour) throw new AppError(404, 'Tour not found');
  return prisma.favorite.upsert({
    where: { userId_tourId: { userId, tourId } },
    update: {},
    create: { userId, tourId },
    include: { tour: true },
  });
}

export function removeFavorite(userId: string, tourId: string) {
  return prisma.favorite.deleteMany({ where: { userId, tourId } });
}

export async function isFavorite(userId: string, tourId: string) {
  const fav = await prisma.favorite.findUnique({ where: { userId_tourId: { userId, tourId } } });
  return Boolean(fav);
}
