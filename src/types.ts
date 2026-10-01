import { formatMoney } from './i18n/format';

export type Role = 'CUSTOMER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export type TourCategory = 'Beach' | 'Mountains' | 'Culture' | 'Relaxation';

export interface TourAddon {
  id: string;
  name: string;
  price: number;
  perPerson: boolean;
}

export interface TourItineraryDay {
  day: number;
  title: string;
  activities: string[];
}

export interface Tour {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: TourCategory;
  departureLocation: string;
  destination: string;
  transportation: string[];
  includedServices: string[];
  excludedServices: string[];
  images: string[];
  duration: string;
  price: number;
  /** Null = no child pricing (everyone pays adult price). */
  childPrice: number | null;
  childMaxAge: number | null;
  addons: TourAddon[];
  /** Null = flexible cancellation until the travel day. */
  freeCancelHours: number | null;
  itinerary: TourItineraryDay[];
  minGuests: number;
  maxGuests: number;
  availableSeats: number;
  rating: number;
  reviewCount: number;
  featured: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD';
export type PaymentStatus = 'PENDING' | 'AWAITING_CONFIRMATION' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface BookingGuest {
  id: string;
  bookingId: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  isChild: boolean;
  phone: string | null;
  email: string | null;
}

export interface Payment {
  id: string;
  bookingId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionCode: string | null;
  paidAt: string | null;
  updatedAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minOrder: number;
  expiresAt: string;
  usageLimit: number | null;
  usedCount: number;
  active: boolean;
}

export interface Booking {
  id: string;
  bookingCode: string;
  userId: string;
  tourId: string;
  couponId: string | null;
  travelDate: string;
  guests: number;
  /** Null on legacy rows = all adults. */
  adults: number | null;
  children: number | null;
  addons: TourAddon[];
  addonsTotal: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  note: string | null;
  subtotal: number;
  discount: number;
  total: number;
  bookingStatus: BookingStatus;
  createdAt: string;
  updatedAt: string;
  tour?: Tour;
  guestsList?: BookingGuest[];
  payment?: Payment | null;
  coupon?: Coupon | null;
  user?: { id: string; name: string; email: string; phone: string | null };
}

export interface Review {
  id: string;
  userId: string;
  tourId: string;
  bookingId: string;
  rating: number;
  comment: string | null;
  images: string[];
  helpfulCount: number;
  hidden?: boolean;
  createdAt: string;
  user?: { id: string; name: string; avatar: string | null };
  tour?: { id: string; title: string };
}

export interface Favorite {
  id: string;
  userId: string;
  tourId: string;
  createdAt: string;
  tour?: Tour;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function formatCurrency(amount: number): string {
  // Locale-aware VND formatting (VND currency kept, number style follows UI language).
  return formatMoney(amount);
}
