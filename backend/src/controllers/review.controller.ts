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
    req.body.images,
  );
  res.status(201).json({ review });
});

export const mine = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await service.getMyReviews(req.user!.id) });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const review = await service.updateReview(req.user!.id, req.params.id, req.body);
  res.json({ review });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.deleteReview(req.user!.id, req.params.id));
});

export const helpful = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.toggleHelpful(req.user!.id, req.params.id));
});
