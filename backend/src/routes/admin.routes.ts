import { Router } from 'express';
import * as c from '../controllers/admin.controller.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { asyncHandler } from '../utils/helpers.js';
import {
  patchCouponSchema,
  patchTourSchema,
  replyReviewSchema,
  setReadSchema,
  tourDateSchema,
  updateBookingStatusSchema,
  updatePaymentStatusSchema,
  updateReviewVisibilitySchema,
  updateUserSchema,
  upsertCouponSchema,
  upsertTourSchema,
} from '../validators/schemas.js';

const router = Router();
router.use(requireAuth, asyncHandler(requireAdmin));

router.get('/revenue/overview', c.revenueOverview);
router.get('/revenue/daily', c.revenueDaily);

router.get('/tours', c.listTours);
router.post('/tours', validateBody(upsertTourSchema), c.createTour);
router.patch('/tours/:id', validateBody(patchTourSchema), c.updateTour);
router.delete('/tours/:id', c.deleteTour);

router.get('/bookings', c.listBookings);
router.get('/payments/awaiting', c.awaitingPayments);
router.get('/bookings/:id', c.getBooking);
router.patch('/bookings/:id', validateBody(updateBookingStatusSchema), c.updateBookingStatus);
router.patch('/bookings/:id/payment', validateBody(updatePaymentStatusSchema), c.updatePaymentStatus);

router.get('/reviews', c.listReviews);
router.get('/reviews/counts', c.reviewCounts);
router.patch('/reviews/:id', validateBody(updateReviewVisibilitySchema), c.setReviewHidden);
router.patch('/reviews/:id/reply', validateBody(replyReviewSchema), c.replyReview);
router.delete('/reviews/:id/reply', c.deleteReply);
router.delete('/reviews/:id', c.deleteReview);

router.get('/contact', c.listContact);
router.patch('/contact/:id', validateBody(setReadSchema), c.setContactRead);
router.delete('/contact/:id', c.deleteContact);

router.get('/tours/:id/dates', c.listTourDates);
router.post('/tours/:id/dates', validateBody(tourDateSchema), c.upsertTourDate);
router.delete('/tours/dates/:dateId', c.deleteTourDate);

router.get('/users', c.listUsers);
router.patch('/users/:id', validateBody(updateUserSchema), c.updateUser);

router.get('/coupons', c.listCoupons);
router.post('/coupons', validateBody(upsertCouponSchema), c.createCoupon);
router.patch('/coupons/:id', validateBody(patchCouponSchema), c.updateCoupon);
router.delete('/coupons/:id', c.deleteCoupon);

export default router;
