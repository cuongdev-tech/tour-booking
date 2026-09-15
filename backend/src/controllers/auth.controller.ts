import type { Request, Response } from 'express';
import * as service from '../services/auth.service.js';
import { asyncHandler } from '../utils/helpers.js';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.register(req.body);
  res.status(201).json(result);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.login(req.body);
  res.json(result);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await service.getMe(req.user!.id);
  res.json({ user });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await service.updateProfile(req.user!.id, req.body);
  res.json({ user });
});
