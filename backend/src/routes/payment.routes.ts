import { Router } from 'express';
import * as c from '../controllers/payment.controller.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/helpers.js';
import { rateLimit } from '../middleware/security.js';

const router = Router();
// Provider webhooks are unauthenticated by design (verified by HMAC + amount).
router.post('/webhook', rateLimit({ windowMs: 60 * 1000, max: 120, name: 'payment-webhook' }), c.webhook);
// Manual sweep trigger (cron also runs it) — admin only (mass-cancel!).
router.post('/sweep', requireAuth, asyncHandler(requireAdmin), c.sweep);
router.get('/rates', c.rates);
export default router;
