import { Router } from 'express';
import * as c from '../controllers/coupon.controller.js';
import { validateBody } from '../middleware/common.js';
import { validateCouponSchema } from '../validators/schemas.js';

const router = Router();
router.post('/validate', validateBody(validateCouponSchema), c.validate);
export default router;
