import { Router } from 'express';
import * as c from '../controllers/booking.controller.js';
import { requireActiveUser, requireAuth, requireCustomer, requireVerifiedEmail } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { asyncHandler } from '../utils/helpers.js';
import { rateLimit } from '../middleware/security.js';
import { createBookingSchema, updateBookingSchema } from '../validators/schemas.js';

const router = Router();
// Public QR verification (no login) — throttled like coupon validation.
router.get('/public/:code', rateLimit({ windowMs: 60 * 1000, max: 60, name: 'ticket-public' }), c.publicTicket);
// Public demo bank info for the payment QR (account number is not a secret).
router.get('/payment-info', rateLimit({ windowMs: 60 * 1000, max: 60, name: 'payment-info' }), c.paymentInfo);

router.use(requireAuth);
router.use(asyncHandler(requireActiveUser));
router.post('/', asyncHandler(requireCustomer), asyncHandler(requireVerifiedEmail), validateBody(createBookingSchema), c.create);
router.get('/mine', c.mine);
router.get('/payment-updates', c.paymentUpdates);
router.get('/code/:code', c.byCode);
router.get('/code/:code/stream', c.stream);
router.patch('/:id/cancel', c.cancel);
router.patch('/:id/confirm-transfer', asyncHandler(requireCustomer), c.confirmTransfer);
router.patch('/:id', asyncHandler(requireCustomer), validateBody(updateBookingSchema), c.update);
export default router;
