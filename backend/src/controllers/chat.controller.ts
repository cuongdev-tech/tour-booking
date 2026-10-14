import type { Request, Response } from 'express';
import { isLiveAdmin } from '../middleware/auth.js';
import * as service from '../services/chat.service.js';
import { asyncHandler } from '../utils/helpers.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const admin = await isLiveAdmin(req.user!.id);
  res.json({ data: await service.listMessages(req.params.id, req.user!.id, admin) });
});

export const send = asyncHandler(async (req: Request, res: Response) => {
  const admin = await isLiveAdmin(req.user!.id);
  const message = await service.sendMessage(
    req.params.id,
    req.user!.id,
    admin ? 'ADMIN' : 'CUSTOMER',
    req.body.body,
  );
  res.status(201).json({ message });
});

export const threads = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await service.adminThreads() });
});
