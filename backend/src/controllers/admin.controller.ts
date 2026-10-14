import type { Request, Response } from 'express';
import * as service from '../services/admin.service.js';
import * as reviewService from '../services/review.service.js';
import * as contactService from '../services/contact.service.js';
import { logAdminAction } from '../services/audit.service.js';
import { AppError, asyncHandler } from '../utils/helpers.js';

export const listTours = asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json(await service.adminListTours(req.query.page, req.query.limit, q));
});
export const createTour = asyncHandler(async (req: Request, res: Response) => {
  const tour = await service.adminCreateTour(req.body);
  logAdminAction(req.user!.id, 'TOUR_CREATE', 'Tour', tour.id, { title: tour.title, price: tour.price });
  res.status(201).json({ tour });
});
export const updateTour = asyncHandler(async (req: Request, res: Response) => {
  const tour = await service.adminUpdateTour(req.params.id, req.body);
  const b = req.body as Record<string, unknown>;
  logAdminAction(req.user!.id, 'TOUR_UPDATE', 'Tour', tour.id, {
    title: b.title,
    price: b.price,
    status: b.status,
    availableSeats: b.availableSeats,
    featured: b.featured,
  });
  res.json({ tour });
});
export const deleteTour = asyncHandler(async (req: Request, res: Response) => {
  await service.adminDeleteTour(req.params.id);
  logAdminAction(req.user!.id, 'TOUR_DELETE', 'Tour', req.params.id, {});
  res.json({ success: true });
});

export const listBookings = asyncHandler(async (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(await service.adminListBookings(status, req.query.page, req.query.limit));
});
export const updateBookingStatus = asyncHandler(async (req: Request, res: Response) => {
  const booking = await service.adminUpdateBookingStatus(req.params.id, req.body.status);
  logAdminAction(req.user!.id, 'BOOKING_STATUS', 'Booking', booking.id, { status: req.body.status });
  res.json({ booking });
});

export const updatePaymentStatus = asyncHandler(async (req: Request, res: Response) => {
  const payment = await service.adminUpdatePaymentStatus(req.params.id, req.body.status);
  logAdminAction(req.user!.id, 'PAYMENT_STATUS', 'Booking', req.params.id, { status: req.body.status });
  res.json({ payment });
});

export const getBooking = asyncHandler(async (req: Request, res: Response) => {
  res.json({ booking: await service.adminGetBooking(req.params.id) });
});

export const awaitingPayments = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await service.adminAwaitingPayments());
});

export const paymentEvents = asyncHandler(async (req: Request, res: Response) => {
  const { listWebhookEvents } = await import('../services/payment-webhook.service.js');
  const { data, pagination } = await listWebhookEvents(
    req.query.page,
    req.query.limit,
    typeof req.query.bookingCode === 'string' ? req.query.bookingCode : undefined,
  );
  res.json({ data, pagination });
});

export const listReviews = asyncHandler(async (req: Request, res: Response) => {
  const hidden = req.query.hidden === '1' || req.query.hidden === 'true' ? true : req.query.hidden === '0' || req.query.hidden === 'false' ? false : undefined;
  // tab=pending -> đang hiện + chưa trả lời, tab=replied -> đã trả lời
  const tab = typeof req.query.tab === 'string' ? req.query.tab : undefined;
  const replied = tab === 'pending' ? false : tab === 'replied' ? true : undefined;
  // Giữ tương thích filter cũ ?hidden=1, đồng thời hỗ trợ ?tab=all|pending|visible|hidden
  let hiddenEff = hidden;
  if (tab === 'visible') hiddenEff = false;
  if (tab === 'hidden') hiddenEff = true;
  if (tab === 'pending') hiddenEff = false;
  res.json(await reviewService.adminListReviews(req.query.page, req.query.limit, hiddenEff, replied));
});

export const setReviewHidden = asyncHandler(async (req: Request, res: Response) => {
  res.json({ review: await reviewService.adminSetReviewHidden(req.params.id, req.body.hidden === true) });
});

export const replyReview = asyncHandler(async (req: Request, res: Response) => {
  res.json({ review: await reviewService.adminReplyReview(req.params.id, String(req.body.reply ?? '')) });
});

export const deleteReply = asyncHandler(async (req: Request, res: Response) => {
  res.json({ review: await reviewService.adminDeleteReply(req.params.id) });
});

export const reviewCounts = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await reviewService.adminReviewCounts());
});

export const revenueOverview = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getRevenueOverview(req.query.month, req.query.year));
});

export const revenueDaily = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getRevenueDaily(req.query.date, req.query.page, req.query.limit));
});

export const deleteReview = asyncHandler(async (req: Request, res: Response) => {
  res.json(await reviewService.adminDeleteReview(req.params.id));
});

export const listContact = asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json(await contactService.adminListContactMessages(req.query.page, req.query.limit, req.query.unread === '1' || req.query.unread === 'true', q));
});

export const setContactRead = asyncHandler(async (req: Request, res: Response) => {
  res.json({ message: await contactService.adminSetContactRead(req.params.id, req.body.isRead === true) });
});

export const deleteContact = asyncHandler(async (req: Request, res: Response) => {
  res.json(await contactService.adminDeleteContactMessage(req.params.id));
});

export const replyContact = asyncHandler(async (req: Request, res: Response) => {
  res.json({ message: await contactService.adminReplyContact(req.params.id, String(req.body.reply ?? '')) });
});

export const deleteContactReply = asyncHandler(async (req: Request, res: Response) => {
  res.json({ message: await contactService.adminDeleteContactReply(req.params.id) });
});

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.adminListUsers(req.query.page, req.query.limit));
});
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  // Never allow modifying your own role/status (prevents locking yourself out).
  if (req.params.id === req.user!.id && (req.body.role !== undefined || req.body.status !== undefined)) {
    throw new AppError(403, 'You cannot modify your own account');
  }
  const user = await service.adminUpdateUser(req.params.id, req.body);
  logAdminAction(req.user!.id, 'USER_UPDATE', 'User', user.id, req.body);
  res.json({ user });
});

export const listCoupons = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.adminListCoupons(req.query.page, req.query.limit));
});
export const createCoupon = asyncHandler(async (req: Request, res: Response) => {
  const coupon = await service.adminCreateCoupon(req.body);
  logAdminAction(req.user!.id, 'COUPON_CREATE', 'Coupon', coupon.id, { code: coupon.code });
  res.status(201).json({ coupon });
});
export const updateCoupon = asyncHandler(async (req: Request, res: Response) => {
  const coupon = await service.adminUpdateCoupon(req.params.id, req.body);
  logAdminAction(req.user!.id, 'COUPON_UPDATE', 'Coupon', coupon.id, req.body);
  res.json({ coupon });
});
export const deleteCoupon = asyncHandler(async (req: Request, res: Response) => {
  await service.adminDeleteCoupon(req.params.id);
  logAdminAction(req.user!.id, 'COUPON_DELETE', 'Coupon', req.params.id, {});
  res.json({ success: true });
});

export const listTourDates = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await service.adminListTourDates(req.params.id) });
});

export const upsertTourDate = asyncHandler(async (req: Request, res: Response) => {
  const tourDate = await service.adminUpsertTourDate(
    req.params.id,
    req.body.date,
    req.body.capacity,
    req.body.guideId ?? undefined,
    req.body.vehicleId ?? undefined,
  );
  logAdminAction(req.user!.id, 'TOURDATE_UPSERT', 'TourDate', tourDate.id, {
    tourId: req.params.id,
    date: req.body.date,
    capacity: req.body.capacity,
  });
  res.json({ tourDate });
});

export const deleteTourDate = asyncHandler(async (req: Request, res: Response) => {
  const r = await service.adminDeleteTourDate(req.params.dateId);
  logAdminAction(req.user!.id, 'TOURDATE_DELETE', 'TourDate', req.params.dateId, {});
  res.json(r);
});
