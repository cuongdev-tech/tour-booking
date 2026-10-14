import type { Request, Response } from 'express';
import { getLoyalty } from '../services/loyalty.service.js';
import { asyncHandler } from '../utils/helpers.js';

export const me = asyncHandler(async (req: Request, res: Response) => {
  res.json(await getLoyalty(req.user!.id));
});
