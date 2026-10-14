import type { Request, Response } from 'express';
import * as service from '../services/qa.service.js';
import { asyncHandler } from '../utils/helpers.js';

function tourIdOf(req: Request): string {
  return req.params.tourId ?? req.params.id;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listQuestions(tourIdOf(req), req.query.page, req.query.limit));
});

export const ask = asyncHandler(async (req: Request, res: Response) => {
  const question = await service.askQuestion(tourIdOf(req), req.user!.id, req.body.question);
  res.status(201).json({ question });
});

export const answer = asyncHandler(async (req: Request, res: Response) => {
  res.json({ question: await service.adminAnswer(req.params.id, req.body.answer ?? null) });
});

export const setHidden = asyncHandler(async (req: Request, res: Response) => {
  res.json({ question: await service.adminHide(req.params.id, req.body.hidden === true) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.adminDelete(req.params.id));
});
