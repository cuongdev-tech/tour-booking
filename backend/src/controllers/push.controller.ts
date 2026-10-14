import type { Request, Response } from 'express';
import * as service from '../services/push.service.js';
import { AppError, asyncHandler } from '../utils/helpers.js';

export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const subscription = await service.subscribe(req.user!.id, req.body);
  res.status(201).json({ subscription });
});

export const unsubscribe = asyncHandler(async (req: Request, res: Response) => {
  const endpoint =
    typeof req.body?.endpoint === 'string'
      ? req.body.endpoint
      : typeof req.query.endpoint === 'string'
        ? req.query.endpoint
        : '';
  if (!endpoint) throw new AppError(400, 'Push endpoint is required');
  res.json(await service.unsubscribe(req.user!.id, endpoint));
});

export const mine = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await service.listMine(req.user!.id) });
});

export const vapidKey = asyncHandler(async (_req: Request, res: Response) => {
  const { env } = await import('../config/env.js');
  res.json({ publicKey: env.vapidPublicKey || null });
});
