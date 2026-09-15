import type { Request, Response } from 'express';
import * as service from '../services/favorite.service.js';
import { asyncHandler } from '../utils/helpers.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const favorites = await service.getFavorites(req.user!.id);
  res.json({ data: favorites });
});

export const add = asyncHandler(async (req: Request, res: Response) => {
  const favorite = await service.addFavorite(req.user!.id, req.params.tourId);
  res.status(201).json({ favorite });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.removeFavorite(req.user!.id, req.params.tourId);
  res.json({ success: true });
});
