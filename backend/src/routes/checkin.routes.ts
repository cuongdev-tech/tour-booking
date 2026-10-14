import { Router } from 'express';
import * as c from '../controllers/checkin.controller.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { rateLimit } from '../middleware/security.js';
import { asyncHandler } from '../utils/helpers.js';
import { checkinSchema } from '../validators/schemas.js';

const router = Router();
// Public QR verification (no login) — throttled like coupon validation.
router.get('/verify', rateLimit({ windowMs: 60 * 1000, max: 60, name: 'checkin-verify' }), c.verify);

router.use(requireAuth, asyncHandler(requireAdmin));
router.post('/checkin', validateBody(checkinSchema), c.checkin);
router.get('/manifest', c.manifest);
export default router;
