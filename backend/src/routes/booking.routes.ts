import { Router } from 'express';
import * as c from '../controllers/booking.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { createBookingSchema } from '../validators/schemas.js';

const router = Router();
router.use(requireAuth);
router.post('/', validateBody(createBookingSchema), c.create);
router.get('/mine', c.mine);
router.get('/code/:code', c.byCode);
router.patch('/:id/cancel', c.cancel);
export default router;
