import type { Request, Response } from 'express';
import * as service from '../services/contact.service.js';
import { asyncHandler } from '../utils/helpers.js';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const message = await service.createContactMessage(req.body);
  res.status(201).json({ message });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json(await service.adminListContactMessages(req.query.page, req.query.limit, unreadOnly, q));
});

export const setRead = asyncHandler(async (req: Request, res: Response) => {
  res.json({ message: await service.adminSetContactRead(req.params.id, req.body.isRead === true) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.adminDeleteContactMessage(req.params.id));
});
