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
    sort: (req.query.sort as 'price_asc' | 'price_desc' | 'rating' | 'newest') ?? 'newest',
    page: req.query.page ? Number(req.query.page) : 1,
    limit: req.query.limit ? Number(req.query.limit) : 9,
  });
  res.json(result);
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const tour = await getTourById(req.params.id);
  if (!tour) throw new AppError(404, 'Tour not found');
  const related = await getRelatedTours(tour.id, tour.destination, tour.category);
  res.json({ tour, related });
});

export const destinations = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await service.getDestinations();
  res.json({ data: rows.map((r) => ({ destination: r.destination, count: r._count.destination })) });
});
