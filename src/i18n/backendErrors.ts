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
    ['Account is disabled', t('backendErrors.accountDisabled')],
    ['Not your booking', t('backendErrors.notYourBooking')],
    ['Booking already cancelled', t('backendErrors.alreadyCancelled')],
    ['Completed booking cannot be cancelled', t('backendErrors.completedNoCancel')],
    ['This booking has already been reviewed', t('backendErrors.alreadyReviewed')],
    ['Only completed bookings can be reviewed', t('backendErrors.completedOnlyReview')],
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
    ['You cannot modify your own account', t('adminUsers.selfActionForbidden')],
  ];
  for (const [key, value] of exact) {
    if (msg === key) return value;
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

  return fallback ?? msg;
}
