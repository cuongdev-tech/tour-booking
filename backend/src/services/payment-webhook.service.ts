import { createHmac } from 'node:crypto';
import { env, prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';

export interface WebhookInput {
  provider: string;
  bookingCode: string;
  amount: number;
  gatewayRef?: string;
  signature?: string;
}

function verifySignature(input: WebhookInput): boolean {
  if (!env.paymentWebhookSecret) return !env.isProduction; // dev only bypass
  if (!input.signature) return false;
  const payload = `${input.bookingCode}:${input.amount}:${input.gatewayRef ?? ''}`;
  const expect = createHmac('sha256', env.paymentWebhookSecret).update(payload).digest('hex');
  try {
    return (
      expect.length === input.signature.length &&
      createHmac('sha256', 'x').update('x').digest().length > 0 &&
      timingSafeEqualHex(expect, input.signature)
    );
  } catch {
    return false;
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Capture payment via provider webhook (SePay/VNPay-style).
 * Idempotent: repeated calls for an already-PAID booking succeed without
 * double effects. Amount must match the booking total exactly.
 */
export async function handlePaymentWebhook(input: WebhookInput, raw: unknown = {}) {
  const rawCode = String(input.bookingCode ?? '').trim();
  // SePay-style content is free text ("SEVQR TB-ABC123 ...") — extract the code.
  const m = /TB-[A-Z0-9]{6}/i.exec(rawCode);
  const code = (m ? m[0] : rawCode).trim().toUpperCase();
  const amountRaw = String(input.amount ?? '').replace(/[,\s₫đ]/g, '');
  const amount = Math.floor(Number(amountRaw));
  const log = (result: string) =>
    prisma.webhookEvent.create({
      data: {
        provider: input.provider,
        bookingCode: code,
        amount: Number.isFinite(input.amount) ? Math.floor(input.amount) : null,
        gatewayRef: input.gatewayRef ?? null,
        result,
        raw: (raw ?? {}) as never,
      },
    });

  if (!code || !Number.isFinite(amount) || amount <= 0) {
    await log('invalid_payload');
    throw new AppError(400, 'Invalid webhook payload');
  }
  if (!verifySignature({ ...input, bookingCode: code, amount })) {
    await log('bad_signature');
    throw new AppError(401, 'Invalid webhook signature');
  }
  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code },
    include: { payment: true },
  });
  if (!booking || !booking.payment) {
    await log('booking_not_found');
    throw new AppError(404, 'Booking not found');
  }
  if (booking.bookingStatus === 'CANCELLED') {
    await log('booking_cancelled');
    throw new AppError(400, 'Booking was cancelled');
  }
  if (booking.payment.amount !== amount) {
    await log('amount_mismatch');
    throw new AppError(400, 'Amount mismatch');
  }
  if (booking.payment.status === 'PAID') {
    if (input.gatewayRef && booking.payment.gatewayRef && input.gatewayRef !== booking.payment.gatewayRef) {
      await log('ref_mismatch');
    } else {
      await log('already_paid');
    }
    return { bookingId: booking.id, status: 'PAID' as const, duplicate: true };
  }
  if (booking.payment.status !== 'PENDING' && booking.payment.status !== 'AWAITING_CONFIRMATION' && booking.payment.status !== 'FAILED') {
    await log('invalid_payment_state');
    throw new AppError(400, 'Invalid payment state');
  }
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${booking.id} FOR UPDATE`;
    const fresh = await tx.payment.findUnique({ where: { bookingId: booking.id } });
    if (!fresh) throw new AppError(404, 'Booking not found');
    if (fresh.status === 'PAID') return fresh;
    if (fresh.status !== 'PENDING' && fresh.status !== 'AWAITING_CONFIRMATION' && fresh.status !== 'FAILED') {
      throw new AppError(400, 'Invalid payment state');
    }
    const pay = await tx.payment.update({
      where: { bookingId: booking.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        gatewayRef: input.gatewayRef ?? fresh.gatewayRef,
        webhookVerified: true,
      },
    });
    await tx.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: null } });
    return pay;
  });
  await log('captured');
  // Best-effort push (never fails the webhook).
  void import('./push.service.js')
    .then((m) =>
      m.sendToUser(booking.userId, {
        title: 'Thanh toán thành công',
        body: `Booking ${code} đã được ghi nhận. Xem vé điện tử của bạn!`,
        url: `/booking-success/${code}`,
      }),
    )
    .catch(() => undefined);
  return { bookingId: booking.id, status: updated.status, duplicate: false };
}

export function listWebhookEvents(page?: unknown, limit?: unknown, bookingCode?: string) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const l = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)));
  const where = bookingCode ? { bookingCode: bookingCode.trim().toUpperCase() } : {};
  return Promise.all([
    prisma.webhookEvent.count({ where }),
    prisma.webhookEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (p - 1) * l, take: l }),
  ]).then(([total, data]) => ({
    data,
    pagination: { page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l)) },
  }));
}
