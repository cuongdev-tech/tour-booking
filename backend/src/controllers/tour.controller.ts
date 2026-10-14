import type { Request, Response } from 'express';
import * as service from '../services/tour.service.js';
import { getRelatedTours, getTourById } from '../services/tour.service.js';
import { asyncHandler } from '../utils/helpers.js';
import { AppError } from '../utils/helpers.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listTours({
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    departure: typeof req.query.departure === 'string' ? req.query.departure : undefined,
    destination: typeof req.query.destination === 'string' ? req.query.destination : undefined,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
    maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
    minRating: req.query.minRating ? Number(req.query.minRating) : undefined,
    featured: req.query.featured === 'true' ? true : req.query.featured === 'false' ? false : undefined,
    status: 'ACTIVE',
    sort: (req.query.sort as 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'departure_earliest') ?? 'newest',
    page: req.query.page ? Number(req.query.page) : 1,
    limit: req.query.limit ? Number(req.query.limit) : 9,
    date: typeof req.query.date === 'string' ? req.query.date : undefined,
    guests: req.query.guests ? Number(req.query.guests) : undefined,
    availableOnly: req.query.availableOnly === 'true' ? true : undefined,
  });
  res.json(result);
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const tour = await getTourById(req.params.id);
  if (!tour || tour.status !== 'ACTIVE') throw new AppError(404, 'Tour not found');
  const related = await getRelatedTours(tour.id, tour.destination, tour.category);
  res.json({ tour, related });
});

export const destinations = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await service.getDestinations();
  res.json({ data: rows.map((r) => ({ destination: r.destination, count: r._count.destination })) });
});

export const recommended = asyncHandler(async (req: Request, res: Response) => {
  const tours = await service.getRecommendedTours(req.user?.id);
  res.json({ data: tours });
});

export const availability = asyncHandler(async (req: Request, res: Response) => {
  // Range mode for the month calendar: ?from=YYYY-MM-DD&to=YYYY-MM-DD (max 93
  // days) or ?month=YYYY-MM (whole month). Single-date ?date= kept unchanged.
  const month = typeof req.query.month === 'string' ? req.query.month : '';
  const fromRaw = typeof req.query.from === 'string' ? req.query.from : '';
  const toRaw = typeof req.query.to === 'string' ? req.query.to : '';
  if (month || fromRaw || toRaw) {
    let from: Date;
    let to: Date;
    if (month) {
      const m = /^(\d{4})-(\d{2})$/.exec(month.trim());
      if (!m) throw new AppError(400, 'Invalid travel date');
      const y = Number(m[1]);
      const mo = Number(m[2]);
      if (mo < 1 || mo > 12) throw new AppError(400, 'Invalid travel date');
      from = new Date(Date.UTC(y, mo - 1, 1));
      to = new Date(Date.UTC(y, mo, 0));
    } else {
      if (!fromRaw || !toRaw) throw new AppError(400, 'Invalid travel date');
      from = new Date(fromRaw);
      to = new Date(toRaw);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new AppError(400, 'Invalid travel date');
      }
    }
    try {
      const info = await service.getTourAvailabilityRange(req.params.id, from, to);
      if (!info) throw new AppError(404, 'Tour not found');
      res.json(info);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(400, 'Invalid travel date');
    }
    return;
  }
  const raw = typeof req.query.date === 'string' ? req.query.date : '';
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.getTime())) throw new AppError(400, 'Invalid travel date');
  const info = await service.getTourAvailability(req.params.id, parsed);
  if (!info) throw new AppError(404, 'Tour not found');
  res.json(info);
});
