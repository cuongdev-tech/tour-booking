import { Prisma } from '@prisma/client';
import { prisma } from '../config/env.js';

export interface TourQuery {
  q?: string;
  departure?: string;
  destination?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  featured?: boolean;
  status?: string;
  sort?: 'price_asc' | 'price_desc' | 'rating' | 'newest';
  page?: number;
  limit?: number;
}

function toFiniteNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export async function listTours(query: TourQuery) {
  const page = Math.max(1, Math.floor(toFiniteNumber(query.page) ?? 1));
  const limit = Math.min(24, Math.max(1, Math.floor(toFiniteNumber(query.limit) ?? 9)));
  const where: Prisma.TourWhereInput = {};

  if (query.status) {
    where.status = query.status as 'ACTIVE' | 'INACTIVE';
  }
  if (query.category) where.category = query.category as 'Beach' | 'Mountains' | 'Culture' | 'Relaxation';
  if (query.departure) where.departureLocation = { contains: query.departure, mode: 'insensitive' };
  if (query.destination) where.destination = { contains: query.destination, mode: 'insensitive' };
  if (query.featured !== undefined) where.featured = query.featured;
  const minRating = toFiniteNumber(query.minRating);
  if (minRating !== undefined) where.rating = { gte: minRating };
  const minPrice = toFiniteNumber(query.minPrice);
  const maxPrice = toFiniteNumber(query.maxPrice);
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {
      ...(minPrice !== undefined ? { gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
    };
  }
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: 'insensitive' } },
      { destination: { contains: query.q, mode: 'insensitive' } },
      { departureLocation: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const orderBy: Prisma.TourOrderByWithRelationInput =
    query.sort === 'price_asc'
      ? { price: 'asc' }
      : query.sort === 'price_desc'
        ? { price: 'desc' }
        : query.sort === 'rating'
          ? { rating: 'desc' }
          : { createdAt: 'desc' };

  const [total, tours] = await Promise.all([
    prisma.tour.count({ where }),
    prisma.tour.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
  ]);

  return { data: tours, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export function getTourById(id: string) {
  return prisma.tour.findUnique({ where: { id } });
}

export async function getRelatedTours(tourId: string, destination: string, category: string) {
  return prisma.tour.findMany({
    where: {
      id: { not: tourId },
      status: 'ACTIVE',
      OR: [{ destination }, { category: category as 'Beach' | 'Mountains' | 'Culture' | 'Relaxation' }],
    },
    take: 3,
    orderBy: { rating: 'desc' },
  });
}

export function getDestinations() {
  return prisma.tour.groupBy({
    by: ['destination'],
    where: { status: 'ACTIVE' },
    _count: { destination: true },
    orderBy: { destination: 'asc' },
  });
}
