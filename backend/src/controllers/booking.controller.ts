import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import * as service from '../services/booking.service.js';
import { asyncHandler } from '../utils/helpers.js';
import { AppError } from '../utils/helpers.js';
import { isLiveAdmin } from '../middleware/auth.js';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const booking = await service.createBooking({ ...req.body, userId: req.user!.id });
  res.status(201).json({ booking });
});

export const mine = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getMyBookings(req.user!.id, req.query.page, req.query.limit);
  // Backward-compat: array when unpaginated, {data,pagination} when paged.
  if (Array.isArray(result)) res.json({ data: result });
  else res.json(result);
});

export const byCode = asyncHandler(async (req: Request, res: Response) => {
  const isAdmin = await isLiveAdmin(req.user!.id);
  const booking = await service.getBookingByCode(req.params.code, req.user!.id, isAdmin);
  if (!booking) throw new AppError(404, 'Booking not found');
  const b = booking as typeof booking & { tour?: { freeCancelHours?: number | null } | null };
  const cancelPolicy = service.getCancelPolicy(
    { travelDate: booking.travelDate, payment: booking.payment },
    b.tour?.freeCancelHours ?? null,
  );
  res.json({ booking, cancelPolicy });
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
  const isAdmin = await isLiveAdmin(req.user!.id);
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

// Server-sent events: live payment status for one booking (owns or admin).
// NOTE: browsers' EventSource can't send Authorization headers, so this is
// for native/fetch-stream clients; the web app keeps 10s polling instead.
export const stream = asyncHandler(async (req: Request, res: Response) => {
  const isAdmin = await isLiveAdmin(req.user!.id);
  const booking = await service.getBookingByCode(req.params.code, req.user!.id, isAdmin);
  if (!booking) throw new AppError(404, 'Booking not found');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  (res as { flushHeaders?: () => void }).flushHeaders?.();
  let ticks = 0;
  let inflight = false;
  let closed = false;
  const done = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    if (!res.writableEnded) res.end();
  };
  const send = (chunk: string) => {
    if (closed || res.writableEnded) return;
    res.write(chunk);
  };
  const tick = () => {
    // Skip overlapping ticks (slow DB must not interleave writes).
    if (inflight || closed) return;
    inflight = true;
    void service
      .getBookingByCode(req.params.code, req.user!.id, isAdmin)
      .then((fresh) => {
        if (closed) return;
        ticks += 1;
        if (!fresh) {
          send(`event: done\ndata: {"gone":true}\n\n`);
          done();
          return;
        }
        const p = fresh.payment;
        send(`data: ${JSON.stringify({ status: p?.status ?? null, bookingStatus: fresh.bookingStatus, total: fresh.total })}\n\n`);
        if (p?.status === 'PAID' || fresh.bookingStatus === 'CANCELLED' || ticks >= 60) {
          send(`event: done\ndata: {}\n\n`);
          done();
        }
      })
      .catch(() => done())
      .finally(() => {
        inflight = false;
      });
  };
  const timer = setInterval(tick, 5000);
  tick();
  req.on('close', done);
  res.on('close', done);
});
