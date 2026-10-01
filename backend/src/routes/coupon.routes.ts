import { Router } from 'express';
import * as c from '../controllers/coupon.controller.js';
import { validateBody } from '../middleware/common.js';
import { rateLimit } from '../middleware/security.js';
import { validateCouponSchema } from '../validators/schemas.js';

const router = Router();
// Public endpoint — throttle code probing (per IP, in-memory).
router.post('/validate', rateLimit({ windowMs: 60 * 1000, max: 60, name: 'coupon-validate' }), validateBody(validateCouponSchema), c.validate);
export default router;
