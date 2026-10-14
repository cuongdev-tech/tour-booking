import type { Request, Response } from 'express';
import { handlePaymentWebhook, listWebhookEvents } from '../services/payment-webhook.service.js';
import { releaseExpiredHolds } from '../services/booking.service.js';
import { asyncHandler } from '../utils/helpers.js';

export const webhook = asyncHandler(async (req: Request, res: Response) => {
  const result = await handlePaymentWebhook(
    {
      provider: String(req.body.provider ?? 'sepay'),
      bookingCode: String(req.body.bookingCode ?? req.body.content ?? ''),
      amount: Number(req.body.amount),
      gatewayRef: req.body.gatewayRef ? String(req.body.gatewayRef) : req.body.transactionId ? String(req.body.transactionId) : undefined,
      signature: req.body.signature ? String(req.body.signature) : req.headers['x-webhook-signature'] ? String(req.headers['x-webhook-signature']) : undefined,
    },
    req.body,
  );
  res.json({ ok: true, ...result });
});

export const sweep = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await releaseExpiredHolds());
});

export const events = asyncHandler(async (req: Request, res: Response) => {
  const { data, pagination } = await listWebhookEvents(req.query.page, req.query.limit, typeof req.query.bookingCode === 'string' ? req.query.bookingCode : undefined);
  res.json({ data, pagination });
});

// Display-only FX rates (all money is stored/charged in VND) + VAT rate.
const RATES: Record<string, number> = { VND: 1, USD: 25000, EUR: 27000, JPY: 170, KRW: 18, CNY: 3450, THB: 700 };

export const rates = asyncHandler(async (_req: Request, res: Response) => {
  const { env } = await import('../config/env.js');
  res.json({ base: 'VND', rates: RATES, vatRate: Number(env.vatRate) || 0 });
});
