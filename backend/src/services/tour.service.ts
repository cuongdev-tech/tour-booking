import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
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
  sort?: 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'departure_earliest';
  page?: number;
  limit?: number;
  date?: string;
  guests?: number;
  availableOnly?: boolean;
}

function toFiniteNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Calendar day (UTC midnight) used as the per-date inventory key. */
export function toCalendarDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

type TourDateDb = Pick<PrismaClient, 'tourDate'>;

/** Remaining seats for a managed date, or null when the date has no row (open). */
export async function getDateAvailability(
  tourId: string,
  day: Date,
  db: TourDateDb = prisma,
): Promise<{ capacity: number; booked: number; remaining: number } | null> {
  const row = await db.tourDate.findUnique({ where: { tourId_date: { tourId, date: day } } });
  if (!row) return null;
  return { capacity: row.capacity, booked: row.booked, remaining: row.capacity - row.booked };
}

// ---------------------------------------------------------------------------
// Accent-insensitive Vietnamese matching.
// The catalog mixes spellings ("Da Nang" vs "Đà Nẵng"), and Postgres `contains
// mode: insensitive` only folds case — so "đà nẵng" never matches "Da Nang".
// Both sides are normalized: the query in JS, the columns via translate().
// NOTE: ơ/ư/đ do NOT decompose, so the NFD-strip shortcut would corrupt them —
// the explicit map below is required on both sides.
// ---------------------------------------------------------------------------
const VI_GROUPS: Array<[string, string]> = [
  ['àáạảãâầấậẩẫăằắặẳẵ', 'a'],
  ['èéẹẻẽêềếệểễ', 'e'],
  ['ìíịỉĩ', 'i'],
  ['òóọỏõôồốộổỗơờớợởỡ', 'o'],
  ['ùúụủũưừứựửữ', 'u'],
  ['ỳýỵỷỹ', 'y'],
  ['đ', 'd'],
];
const VI_SRC = VI_GROUPS.map(([chars]) => chars).join('');
const VI_DST = VI_GROUPS.map(([chars, base]) => base.repeat(chars.length)).join('');

export function stripVietnamese(input: string): string {
  let out = input;
  for (const [chars, base] of VI_GROUPS) {
    out = out.replace(new RegExp(`[${chars}${chars.toUpperCase()}]`, 'g'), base);
  }
  return out.toLowerCase();
}

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Allow-listed (table, column) pairs for accent-insensitive matching.
// Identifiers come only from this map — never from user input.
const TEXT_COLUMNS = {
  Tour: ['title', 'destination', 'departureLocation', 'description'],
  ContactMessage: ['name', 'email', 'message'],
} as const;

type TextTable = keyof typeof TEXT_COLUMNS;

/** Row ids whose column matches the term ignoring case AND Vietnamese diacritics. */
export async function matchTextIds(table: TextTable, column: string, term: string): Promise<string[]> {
  if (!(TEXT_COLUMNS[table] as readonly string[]).includes(column)) {
    throw new Error(`matchTextIds: column not allowed: ${table}.${column}`);
  }
  const norm = stripVietnamese(term).trim();
  if (!norm) return [];
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM ${Prisma.raw(`"${table}"`)}
    WHERE translate(lower(${Prisma.raw(`"${column}"`)}), ${VI_SRC}, ${VI_DST}) LIKE ${likePattern(norm)} ESCAPE '\'
  `;
  return rows.map((r) => r.id);
}

/** Tour ids whose column matches the term ignoring case AND Vietnamese diacritics. */
async function matchIdsByColumn(column: 'title' | 'destination' | 'departureLocation' | 'description', term: string): Promise<string[]> {
  return matchTextIds('Tour', column, term);
}

export async function listTours(query: TourQuery) {
  const page = Math.max(1, Math.floor(toFiniteNumber(query.page) ?? 1));
  const limit = Math.min(24, Math.max(1, Math.floor(toFiniteNumber(query.limit) ?? 9)));
  const where: Prisma.TourWhereInput = {};

  if (query.status) {
    if (query.status === 'ACTIVE' || query.status === 'INACTIVE') where.status = query.status;
  }
  if (query.category) {
    const cats = ['Beach', 'Mountains', 'Culture', 'Relaxation'] as const;
    if ((cats as readonly string[]).includes(query.category)) {
      where.category = query.category as (typeof cats)[number];
    }
  }

  // Text filters are accent-insensitive (see helper above): resolve matching ids
  // with SQL-side normalization, then intersect. Replaces Prisma `contains`,
  // which misses diacritic mismatches ("đà nẵng" vs "Da Nang").
  const idSets: string[][] = [];
  if (query.departure) idSets.push(await matchIdsByColumn('departureLocation', query.departure));
  if (query.destination) idSets.push(await matchIdsByColumn('destination', query.destination));
  if (query.q) {
    const [byTitle, byDestination, byDeparture, byDescription] = await Promise.all([
      matchIdsByColumn('title', query.q),
      matchIdsByColumn('destination', query.q),
      matchIdsByColumn('departureLocation', query.q),
      matchIdsByColumn('description', query.q),
    ]);
    idSets.push([...new Set([...byTitle, ...byDestination, ...byDeparture, ...byDescription])]);
  }
  if (idSets.length > 0) {
    const [first, ...rest] = idSets;
    const keep = new Set(first);
    for (const ids of rest) {
      const next = new Set(ids);
      for (const id of keep) {
        if (!next.has(id)) keep.delete(id);
      }
    }
    where.id = { in: [...keep] };
  }
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

  const orderBy: Prisma.TourOrderByWithRelationInput[] | Prisma.TourOrderByWithRelationInput =
    query.sort === 'price_asc'
      ? { price: 'asc' }
      : query.sort === 'price_desc'
        ? { price: 'desc' }
        : query.sort === 'rating'
          ? { rating: 'desc' }
          : query.sort === 'departure_earliest'
            ? [{ departureHour: 'asc' }, { createdAt: 'desc' }]
            : { createdAt: 'desc' };

  const [total, tours] = await Promise.all([
    prisma.tour.count({ where }),
    prisma.tour.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
  ]);

  // Advanced filter: only tours with seats left for a given date + party size.
  // Managed dates use their bucket, open dates use global availableSeats.
  // NOTE: total counts pre-filter candidates (pagination may show fewer rows
  // on filtered pages) — documented tradeoff to avoid N+1 count queries.
  let data = tours;
  const guests = toFiniteNumber(query.guests);
  if (query.date && !Number.isNaN(Date.parse(query.date))) {
    const day = toCalendarDay(new Date(query.date));
    const need = guests && guests > 0 ? Math.floor(guests) : 1;
    const rows = await prisma.tourDate.findMany({
      where: { tourId: { in: tours.map((t) => t.id) }, date: day },
    });
    const byTour = new Map(rows.map((r) => [r.tourId, r]));
    data = tours.filter((t) => {
      const row = byTour.get(t.id);
      const remaining = row ? row.capacity - row.booked : t.availableSeats;
      if (query.availableOnly && remaining <= 0) return false;
      return remaining >= need;
    });
  } else if (query.availableOnly) {
    data = tours.filter((t) => t.availableSeats > 0);
  }

  return { data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

export function getTourById(id: string) {
  return prisma.tour.findUnique({ where: { id } });
}

export async function getRelatedTours(tourId: string, destination: string, category: string) {
  // Destination match is accent-insensitive (same normalization as the listing
  // search) so "Đà Nẵng" still relates to "Da Nang" and vice versa.
  const destIds = await matchIdsByColumn('destination', destination);
  return prisma.tour.findMany({
    where: {
      id: { not: tourId },
      status: 'ACTIVE',
      OR: [{ id: { in: destIds } }, { category: category as 'Beach' | 'Mountains' | 'Culture' | 'Relaxation' }],
    },
    take: 3,
    orderBy: { rating: 'desc' },
  });
}

/** Public per-date availability for one tour + day (null when the date is unmanaged/open). */
export async function getTourAvailability(tourId: string, date: Date) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId }, select: { id: true, status: true } });
  if (!tour || tour.status !== 'ACTIVE') return null;
  const day = toCalendarDay(date);
  const info = await getDateAvailability(tourId, day);
  return {
    date: day.toISOString().slice(0, 10),
    managed: info !== null,
    capacity: info?.capacity ?? null,
    booked: info?.booked ?? null,
    remaining: info ? info.remaining : null,
  };
}

export interface AvailabilityDay {
  date: string;
  managed: boolean;
  capacity: number | null;
  booked: number | null;
  /** Seats left for this day (per-date bucket, or global seats for open dates). */
  remaining: number;
  past: boolean;
}

/**
 * Range availability for the month calendar (max 93 days per request).
 * Unmanaged dates fall back to the tour's global availableSeats.
 */
export async function getTourAvailabilityRange(tourId: string, from: Date, to: Date) {
  const tour = await prisma.tour.findUnique({
    where: { id: tourId },
    select: { id: true, status: true, availableSeats: true },
  });
  if (!tour || tour.status !== 'ACTIVE') return null;
  const start = toCalendarDay(from);
  const end = toCalendarDay(to);
  if (end.getTime() < start.getTime()) throw new Error('Invalid range');
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (dayCount < 1 || dayCount > 93) throw new Error('Invalid range');

  const rows = await prisma.tourDate.findMany({
    where: { tourId, date: { gte: start, lte: end } },
  });
  const byDate = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days: AvailabilityDay[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    const d = new Date(start.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key);
    const past = d.getTime() < todayUtc;
    days.push({
      date: key,
      managed: row !== undefined,
      capacity: row?.capacity ?? null,
      booked: row?.booked ?? null,
      remaining: row ? row.capacity - row.booked : Math.max(0, tour.availableSeats),
      past,
    });
  }
  return { tourId, from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), globalSeats: tour.availableSeats, days };
}

export function getDestinations() {
  return prisma.tour.groupBy({
    by: ['destination'],
    where: { status: 'ACTIVE' },
    _count: { destination: true },
    orderBy: { destination: 'asc' },
  });
}

/**
 * Personal recommendations: tastes inferred from bookings (2), completed
 * trips (1.5 bonus), favorites (1) and reviews (0.5) by category + destination,
 * with recency decay (recent activity counts more). Already-booked and
 * favorited tours are excluded. Guests / empty history fall back to
 * top-rated featured tours.
 */
export async function getRecommendedTours(userId?: string, take = 8) {
  const limit = Math.min(12, Math.max(1, take));
  if (!userId) {
    return prisma.tour.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ featured: 'desc' }, { rating: 'desc' }],
      take: limit,
    });
  }
  const [bookings, favorites, reviews] = await Promise.all([
    prisma.booking.findMany({
      where: { userId },
      select: {
        tourId: true,
        bookingStatus: true,
        createdAt: true,
        tour: { select: { category: true, destination: true } },
      },
    }),
    prisma.favorite.findMany({
      where: { userId },
      select: { tourId: true, tour: { select: { category: true, destination: true } } },
    }),
    prisma.review.findMany({
      where: { userId },
      select: { tourId: true, rating: true },
    }),
  ]);
  const catW = new Map<string, number>();
  const destW = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string, w: number) => m.set(k, (m.get(k) ?? 0) + w);
  const decay = (at: Date): number => {
    const days = (Date.now() - at.getTime()) / 86400000;
    if (days < 30) return 1;
    if (days < 180) return 0.7;
    return 0.4;
  };
  for (const b of bookings) {
    const w = 2 * decay(b.createdAt) + (b.bookingStatus === 'COMPLETED' ? 1.5 : 0);
    bump(catW, b.tour.category, w);
    bump(destW, stripVietnamese(b.tour.destination), w);
  }
  for (const f of favorites) {
    bump(catW, f.tour.category, 1);
    bump(destW, stripVietnamese(f.tour.destination), 1);
  }
  const bumpReviewTours: Array<{ tourId: string; w: number }> = [];
  for (const r of reviews) {
    // High-rated own reviews reinforce the taste signal.
    const w = r.rating >= 4 ? 0.5 : 0.2;
    bumpReviewTours.push({ tourId: r.tourId, w });
  }
  if (bumpReviewTours.length > 0) {
    const reviewTours = await prisma.tour.findMany({
      where: { id: { in: [...new Set(bumpReviewTours.map((b) => b.tourId))] } },
      select: { id: true, category: true, destination: true },
    });
    const byId = new Map(reviewTours.map((t) => [t.id, t]));
    for (const b of bumpReviewTours) {
      const t = byId.get(b.tourId);
      if (t) {
        bump(catW, t.category, b.w);
        bump(destW, stripVietnamese(t.destination), b.w);
      }
    }
  }
  if (catW.size === 0 && destW.size === 0) {
    return prisma.tour.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ featured: 'desc' }, { rating: 'desc' }],
      take: limit,
    });
  }
  const exclude = [...new Set([...bookings.map((b) => b.tourId), ...favorites.map((f) => f.tourId)])];
  const candidates = await prisma.tour.findMany({
    where: { status: 'ACTIVE', id: { notIn: exclude } },
    take: 100,
    orderBy: { rating: 'desc' },
  });
  const scored = candidates.map((t) => ({
    tour: t,
    score: (catW.get(t.category) ?? 0) * 2 + (destW.get(stripVietnamese(t.destination)) ?? 0) * 2 + t.rating * 0.5 + (t.featured ? 0.5 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  // Diversity: avoid returning 8 tours of the same destination.
  const seen = new Map<string, number>();
  const diverse = scored.filter((s) => {
    const k = stripVietnamese(s.tour.destination);
    const n = seen.get(k) ?? 0;
    if (n >= 3) return false;
    seen.set(k, n + 1);
    return true;
  });
  return (diverse.length >= limit ? diverse : scored).slice(0, limit).map((s) => s.tour);
}
