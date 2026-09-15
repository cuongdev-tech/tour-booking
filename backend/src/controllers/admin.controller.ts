import type { Request, Response } from 'express';
import * as service from '../services/admin.service.js';
import { AppError, asyncHandler } from '../utils/helpers.js';

export const stats = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await service.getStats());
});

export const listTours = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.adminListTours(req.query.page, req.query.limit));
});
export const createTour = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ tour: await service.adminCreateTour(req.body) });
});
export const updateTour = asyncHandler(async (req: Request, res: Response) => {
  res.json({ tour: await service.adminUpdateTour(req.params.id, req.body) });
});
export const deleteTour = asyncHandler(async (req: Request, res: Response) => {
  await service.adminDeleteTour(req.params.id);
  res.json({ success: true });
});

export const listBookings = asyncHandler(async (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(await service.adminListBookings(status, req.query.page, req.query.limit));
});
export const updateBookingStatus = asyncHandler(async (req: Request, res: Response) => {
  res.json({ booking: await service.adminUpdateBookingStatus(req.params.id, req.body.status) });
});

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.adminListUsers(req.query.page, req.query.limit));
});
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  // Never allow modifying your own role/status (prevents locking yourself out).
  if (req.params.id === req.user!.id && (req.body.role !== undefined || req.body.status !== undefined)) {
    throw new AppError(403, 'You cannot modify your own account');
  }
  res.json({ user: await service.adminUpdateUser(req.params.id, req.body) });
});

export const listCoupons = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.adminListCoupons(req.query.page, req.query.limit));
});
export const createCoupon = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ coupon: await service.adminCreateCoupon(req.body) });
});
export const updateCoupon = asyncHandler(async (req: Request, res: Response) => {
  res.json({ coupon: await service.adminUpdateCoupon(req.params.id, req.body) });
});
export const deleteCoupon = asyncHandler(async (req: Request, res: Response) => {
  await service.adminDeleteCoupon(req.params.id);
  res.json({ success: true });
});
