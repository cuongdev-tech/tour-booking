import type { Request, Response } from 'express';
import * as service from '../services/combo.service.js';
import { asyncHandler } from '../utils/helpers.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listCombos({ status: req.query.status, page: req.query.page, limit: req.query.limit }));
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getComboDetail(req.params.slug));
});

export const adminList = asyncHandler(async (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(await service.adminListCombos(status, req.query.page, req.query.limit));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const combo = await service.adminCreateCombo(req.body);
  res.status(201).json({ combo });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const combo = await service.adminUpdateCombo(req.params.id, req.body);
  res.json({ combo });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.adminDeleteCombo(req.params.id));
});

export const book = asyncHandler(async (req: Request, res: Response) => {
  const combo = await service.getComboDetail(req.params.id);
  const tourIds = (combo.tours as Array<{ id: string }>).map((t) => t.id);
  const { bookCombo } = await import('../services/booking.service.js');
  const result = await bookCombo(
    { id: combo.combo.id, tourIds, discountPercent: combo.combo.discountPercent },
    { ...req.body, userId: req.user!.id },
  );
  res.status(201).json(result);
});

export const group = asyncHandler(async (req: Request, res: Response) => {
  const { isLiveAdmin } = await import('../middleware/auth.js');
  const isAdmin = await isLiveAdmin(req.user!.id);
  res.json({ data: await service.getComboGroup(req.params.group, req.user!.id, isAdmin) });
});
