import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodSchema } from 'zod';
import { AppError } from '../utils/helpers.js';

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      throw new AppError(400, message);
    }
    req.body = result.data;
    next();
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique conflict (duplicate favorite/review/booking code/email, coupon code, slug).
    if (err.code === 'P2002') {
      res.status(409).json({ message: 'Resource already exists' });
      return;
    }
    // Record not found (update/delete on missing id).
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'Resource not found' });
      return;
    }
    // FK violation (e.g. deleting a tour that has bookings).
    if (err.code === 'P2003') {
      res.status(400).json({ message: 'Operation violates data constraints (record is in use)' });
      return;
    }
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    // Raw DB errors such as RESTRICT violations surface here; never leak internals.
    if (/foreign key|RESTRICT|violates/i.test(err.message)) {
      res.status(400).json({ message: 'Operation violates data constraints (record is in use)' });
      return;
    }
  }
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ message: 'Not found' });
}
