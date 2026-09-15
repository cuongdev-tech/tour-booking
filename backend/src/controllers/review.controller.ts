import type { Request, Response } from 'express';
import * as service from '../services/review.service.js';
import { asyncHandler } from '../utils/helpers.js';

export const listByTour = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await service.getTourReviews(req.params.tourId);
  res.json({ data: reviews });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const review = await service.createReview(
    req.user!.id,
    req.body.bookingId,
    req.body.rating,
    req.body.comment,
  );
  res.status(201).json({ review });
});
