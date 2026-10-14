import { Router } from 'express';
import * as c from '../controllers/admin.controller.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { asyncHandler } from '../utils/helpers.js';
import {
  patchCouponSchema,
  patchGuideSchema,
  patchTourSchema,
  patchVehicleSchema,
  guideSchema,
  replyReviewSchema,
  setReadSchema,
  tourDateSchema,
  updateBookingStatusSchema,
  updatePaymentStatusSchema,
  updateReviewVisibilitySchema,
  updateUserSchema,
  upsertCouponSchema,
  upsertTourSchema,
  vehicleSchema,
} from '../validators/schemas.js';
import * as fleet from '../controllers/fleet.controller.js';

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
router.get('/payments/events', c.paymentEvents);
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
router.patch('/contact/:id/reply', validateBody(replyReviewSchema), c.replyContact);
router.delete('/contact/:id/reply', c.deleteContactReply);
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

router.get('/audit-log', fleet.auditLog);

router.get('/guides', fleet.listGuides);
router.post('/guides', validateBody(guideSchema), fleet.createGuide);
router.patch('/guides/:id', validateBody(patchGuideSchema), fleet.updateGuide);
router.delete('/guides/:id', fleet.deleteGuide);

router.get('/vehicles', fleet.listVehicles);
router.post('/vehicles', validateBody(vehicleSchema), fleet.createVehicle);
router.patch('/vehicles/:id', validateBody(patchVehicleSchema), fleet.updateVehicle);
router.delete('/vehicles/:id', fleet.deleteVehicle);

export default router;
