import type { Request, Response } from 'express';
import * as service from '../services/checkin.service.js';
import { AppError, asyncHandler } from '../utils/helpers.js';
import { checkinSchema } from '../validators/schemas.js';

export const verify = asyncHandler(async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const sig = typeof req.query.t === 'string' ? req.query.t : '';
  const parsed = checkinSchema.safeParse({ code });
  if (!parsed.success) throw new AppError(400, 'Booking code is required');
  res.json(await service.verifyTicketPayload(parsed.data.code, sig));
});

export const checkin = asyncHandler(async (req: Request, res: Response) => {
  const sig = typeof req.body.signature === 'string' ? req.body.signature : undefined;
  const booking = await service.staffCheckin(req.body.code, req.user!.id, sig);
  res.json({ booking });
});

export const manifest = asyncHandler(async (req: Request, res: Response) => {
  const dateISO = typeof req.query.date === 'string' ? req.query.date : undefined;
  const tourId = typeof req.query.tourId === 'string' ? req.query.tourId : undefined;
  res.json({ data: await service.manifest(dateISO, tourId) });
});
