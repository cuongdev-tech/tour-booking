import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import * as service from '../services/booking.service.js';
import { asyncHandler } from '../utils/helpers.js';
import { AppError } from '../utils/helpers.js';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const booking = await service.createBooking({ ...req.body, userId: req.user!.id });
  res.status(201).json({ booking });
});

export const mine = asyncHandler(async (req: Request, res: Response) => {
  const bookings = await service.getMyBookings(req.user!.id);
  res.json({ data: bookings });
});

export const byCode = asyncHandler(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === 'ADMIN';
  const booking = await service.getBookingByCode(req.params.code, req.user!.id, isAdmin);
  if (!booking) throw new AppError(404, 'Booking not found');
  res.json({ booking });
});

export const publicTicket = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await service.getPublicTicket(req.params.code);
  if (!ticket) throw new AppError(404, 'Booking not found');
  res.json({ ticket });
});

export const paymentInfo = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    demo: env.bankAccountNumber === '0123456789',
    bankName: env.bankName,
    accountNumber: env.bankAccountNumber,
    accountName: env.bankAccountName,
  });
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === 'ADMIN';
  const booking = await service.cancelBooking(req.params.id, req.user!.id, isAdmin);
  res.json({ booking });
});

export const confirmTransfer = asyncHandler(async (req: Request, res: Response) => {
  const payment = await service.confirmTransfer(req.params.id, req.user!.id);
  res.json({ payment });
});

export const paymentUpdates = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getPaymentUpdates(req.user!.id);
  res.json({ data });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const booking = await service.updateBooking(req.params.id, req.user!.id, req.body);
  res.json({ booking });
});
