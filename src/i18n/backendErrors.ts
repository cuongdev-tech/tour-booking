import i18n from './index';
import { formatMoney } from './format';

/**
 * Maps common backend (English) error messages to translated UI strings.
 * Backend/API is untouched — this only affects what the user sees.
 * Unknown messages fall back to the original English text.
 */
export function translateBackendError(message: string, fallback?: string): string {
  const t = i18n.t.bind(i18n);
  const msg = (message ?? '').trim();
  if (!msg) return fallback ?? msg;

  const exact: Array<[string, string]> = [
    ['Coupon does not exist', t('backendErrors.couponNotExist')],
    ['Coupon is inactive', t('backendErrors.couponInactive')],
    ['Coupon is no longer valid', t('backendErrors.couponInactive')],
    ['Coupon has expired', t('backendErrors.couponExpired')],
    ['Coupon usage limit exceeded', t('backendErrors.couponUsageLimit')],
    ['Tour not found', t('backendErrors.tourNotFound')],
    ['Tour is not available for booking', t('backendErrors.tourNotAvailable')],
    ['Tour is no longer available', t('backendErrors.tourNotAvailable')],
    ['Travel date must be today or in the future', t('backendErrors.travelDateFuture')],
    ['Invalid travel date', t('backendErrors.invalidTravelDate')],
    ['Invalid email or password', t('backendErrors.invalidCredentials')],
    ['Email already registered', t('backendErrors.emailRegistered')],
    ['Unable to register with this email', t('backendErrors.emailRegistered')],
    ['Email verification required', t('auth.verifyRequired', { defaultValue: 'Bạn cần xác thực email trước khi đặt tour.' })],
    ['Verification link is invalid or expired', t('auth.verifyInvalid', { defaultValue: 'Link xác thực không hợp lệ hoặc đã hết hạn (24h).' })],
    ['Hold no longer expired', t('bookings.holdExpired', { defaultValue: 'Giữ chỗ đã hết hạn hoặc đã thanh toán.' })],
    ['Booking hold expired', t('bookings.holdExpired', { defaultValue: 'Giữ chỗ đã hết hạn hoặc đã thanh toán.' })],
    ['Account is disabled', t('backendErrors.accountDisabled')],
    ['Not your booking', t('backendErrors.notYourBooking')],
    ['Booking already cancelled', t('backendErrors.alreadyCancelled')],
    ['Completed booking cannot be cancelled', t('backendErrors.completedNoCancel')],
    ['Invalid status transition', t('backendErrors.invalidTransition')],
    ['Cannot cancel a tour that already started', t('backendErrors.tourStartedNoCancel')],
    ['Too many requests, please try again later', t('backendErrors.rateLimited')],
    ['Reset link is invalid or expired', t('backendErrors.resetInvalid')],
    ['This date is sold out', t('backendErrors.dateSoldOut')],
    ['Cannot modify a booking that already started', t('backendErrors.tourStartedNoModify')],
    ['Only upcoming bookings can be modified', t('backendErrors.upcomingOnlyModify')],
    ['Paid bookings cannot be modified', t('backendErrors.paidNoModify')],
    ['Payment is being processed and cannot be modified', t('backendErrors.paymentLocked')],
    ['Capacity cannot be below booked seats', t('backendErrors.capacityBelowBooked')],
    ['This booking has already been reviewed', t('backendErrors.alreadyReviewed')],
    ['Only completed bookings can be reviewed', t('backendErrors.completedOnlyReview')],
    ['Tour has not taken place yet', t('backendErrors.tourNotFinished')],
    ['Booking not found', t('backendErrors.bookingNotFound')],
    ['Admin access required', t('backendErrors.adminRequired')],
    ['Unauthorized', t('backendErrors.unauthorized')],
    ['Token expired or invalid', t('backendErrors.tokenInvalid')],
    ['User not found', t('backendErrors.userNotFound')],
    ['Missing or invalid authorization header', t('backendErrors.unauthorized')],
    ['Resource already exists', t('backendErrors.conflict')],
    ['Resource not found', t('backendErrors.resourceNotFound')],
    ['Operation violates data constraints (record is in use)', t('backendErrors.recordInUse')],
    ['Cannot delete tour with existing bookings', t('backendErrors.tourHasBookings')],
    ['Tour does not offer child tickets', t('backendErrors.childNotOffered')],
    ['At least one adult is required', t('backendErrors.adultRequired')],
    ['Selected add-ons are invalid', t('backendErrors.addonsInvalid')],
    ['Free cancellation period has ended', t('backendErrors.freeCancelEnded')],
    ['Coupon is not active yet', t('backendErrors.couponInactive')],
    ['Coupon is not applicable to this tour', t('backendErrors.couponNotApplicable', { defaultValue: 'Coupon không áp dụng cho tour này' })],
    ['Not enough loyalty points', t('backendErrors.notEnoughPoints', { defaultValue: 'Không đủ điểm loyalty' })],
    ['Cannot re-activate a tour that already started', t('backendErrors.tourStartedNoCancel')],
    ['Cannot delete coupon with existing bookings', t('backendErrors.recordInUse')],
    ['Cannot vote your own review', t('backendErrors.ownVote')],
    ['Only paid bookings can be completed', t('backendErrors.completedNeedsPaid')],
    ['Admin accounts cannot place bookings', t('backendErrors.adminNoBooking')],
    ['You cannot modify your own account', t('adminUsers.selfActionForbidden')],
    ['Cannot remove the last active admin', t('adminUsers.lastAdmin')],
    ['Guest name is required', t('validation.guestNameRequired')],
    ['Child date of birth is required', t('validation.childDobRequired')],
    ['Invalid date of birth', t('validation.dobInvalid')],
    ['Child age is not eligible for child tickets', t('validation.childAgeInvalid')],
    ['Name is required', t('validation.nameRequired')],
    ['Invalid phone number', t('validation.phoneInvalid')],
    ['Combo must include at least 2 tours', t('backendErrors.comboMinTours', { defaultValue: 'Combo phải gồm ít nhất 2 tours' })],
    ['Private tour is not available', t('backendErrors.privateNotAvailable', { defaultValue: 'Tour riêng hiện không khả dụng' })],
    ['Payment not completed', t('backendErrors.paymentNotCompleted', { defaultValue: 'Thanh toán chưa hoàn tất' })],
    ['Booking cannot be checked in', t('backendErrors.checkinFailed', { defaultValue: 'Không thể điểm danh booking này' })],
    ['Invalid currency', t('backendErrors.invalidCurrency', { defaultValue: 'Loại tiền tệ không hợp lệ' })],
    ['Access denied', t('backendErrors.accessDenied', { defaultValue: 'Không có quyền truy cập' })],
    ['Hold no longer expired', t('bookings.holdExpired', { defaultValue: 'Giữ chỗ đã hết hạn hoặc đã thanh toán.' })],
    ['Combo contains unavailable tour', t('backendErrors.comboUnavailable', { defaultValue: 'Combo có tour đã ngừng bán' })],
    ['Ticket signature is invalid', t('verify.signatureInvalid', { defaultValue: 'Không hợp lệ — vé có thể bị giả mạo' })],
    ['Push endpoint already registered', t('backendErrors.pushRegistered', { defaultValue: 'Thiết bị đã đăng ký ở tài khoản khác' })],
    ['Message must be 1-2000 characters', t('bookings.messageLength', { defaultValue: 'Tin nhắn 1-2000 ký tự' })],
    ['Question must be 5-1000 characters', t('bookings.questionLength', { defaultValue: 'Câu hỏi 5-1000 ký tự' })],
  ];
  for (const [key, value] of exact) {
    if (msg === key) return value;
  }
  // Zod field errors arrive as "path: message" (e.g. "guestsList.0.fullName: ...")
  // — match those by their message tail too.
  for (const [key, value] of exact) {
    if (msg.endsWith(`: ${key}`)) return value;
  }

  // "Coupon requires minimum order of 1.000.000₫" (amount varies)
  const minOrderPrefix = 'Coupon requires minimum order of ';
  if (msg.startsWith(minOrderPrefix)) {
    const raw = msg.slice(minOrderPrefix.length).replace(/[₫\s]/g, '').replace(/[.,]/g, '');
    const amount = Number(raw);
    const shown = Number.isFinite(amount) && amount > 0 ? formatMoney(amount) : msg.slice(minOrderPrefix.length);
    return t('backendErrors.couponMinOrder', { amount: shown });
  }

  // "Only 3 seat(s) left"
  const seats = msg.match(/^Only (\d+) seat\(s\) left$/);
  if (seats) return t('backendErrors.seatsLeft', { count: seats[1] });

  // "Tour requires at least X guest(s)" / "Tour allows at most X guest(s)"
  const minG = msg.match(/^Tour requires at least (\d+) guest\(s\)$/);
  if (minG) return t('backendErrors.guestsMin', { count: minG[1] });
  const maxG = msg.match(/^Tour allows at most (\d+) guest\(s\)$/);
  if (maxG) return t('backendErrors.guestsMax', { count: maxG[1] });
  const couponG = msg.match(/^Coupon requires at least (\d+) guest\(s\)$/);
  if (couponG) return t('backendErrors.couponMinGuests', { count: couponG[1], defaultValue: `Coupon yêu cầu tối thiểu ${couponG[1]} khách` });

  return fallback ?? msg;
}
