import { Router } from 'express';
import * as c from '../controllers/admin.controller.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import {
  patchCouponSchema,
  patchTourSchema,
  updateBookingStatusSchema,
  updateUserSchema,
  upsertCouponSchema,
  upsertTourSchema,
} from '../validators/schemas.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/stats', c.stats);

router.get('/tours', c.listTours);
router.post('/tours', validateBody(upsertTourSchema), c.createTour);
router.patch('/tours/:id', validateBody(patchTourSchema), c.updateTour);
router.delete('/tours/:id', c.deleteTour);

router.get('/bookings', c.listBookings);
router.patch('/bookings/:id', validateBody(updateBookingStatusSchema), c.updateBookingStatus);

router.get('/users', c.listUsers);
router.patch('/users/:id', validateBody(updateUserSchema), c.updateUser);

router.get('/coupons', c.listCoupons);
router.post('/coupons', validateBody(upsertCouponSchema), c.createCoupon);
router.patch('/coupons/:id', validateBody(patchCouponSchema), c.updateCoupon);
router.delete('/coupons/:id', c.deleteCoupon);

export default router;
