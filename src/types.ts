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
  emailVerified?: boolean;
  loyaltyPoints?: number;
  referralCode?: string | null;
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
  departureHour?: number | null;
  priceTiers?: PriceTier[];
  privateAvailable?: boolean;
  privateSurcharge?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PriceTier {
  id?: string;
  minGuests: number;
  maxGuests?: number | null;
  price: number;
  childPrice?: number | null;
}

export interface Combo {
  id: string;
  slug: string;
  title: string;
  description: string;
  images: string[];
  discountPercent: number;
  status: 'ACTIVE' | 'INACTIVE';
  featured?: boolean;
  tourIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover: string | null;
  publishedAt: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PostDetail extends Post {
  content: string;
  tourIds: string[];
}

export interface TourQuestion {
  id: string;
  tourId: string;
  userId?: string | null;
  question: string;
  answer: string | null;
  answeredAt?: string | null;
  hidden?: boolean;
  createdAt: string;
  updatedAt?: string;
  user?: { id: string; name: string } | null;
}

export interface BookingMessage {
  id: string;
  bookingId: string;
  senderId: string;
  senderRole?: string;
  body: string;
  createdAt: string;
  sender?: { id: string; name: string; role?: string } | null;
}

export interface ChatThread {
  bookingId: string;
  bookingCode: string;
  lastAt: string | null;
  lastMessage: { id: string; body: string } | string | null;
  tour?: { id: string; title: string } | null;
  customer?: { id: string; name: string; email?: string } | null;
}

export interface CancelPolicy {
  freeCancelHours: number | null;
  deadline: string | null;
  refundable: boolean;
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
  gatewayRef?: string | null;
  webhookVerified?: boolean;
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
  applicableTourIds?: string[];
  applicableCategory?: string | null;
  startsAt?: string | null;
  maxDiscount?: number | null;
  minGuests?: number;
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
  /** Unit-price snapshot at booking time (null on legacy rows). */
  adultUnitPrice?: number | null;
  childUnitPrice?: number | null;
  loyaltyUsed?: number;
  loyaltyDiscount?: number;
  holdExpiresAt?: string | null;
  cancelReason?: string | null;
  isPrivate?: boolean;
  privateSurcharge?: number;
  comboId?: string | null;
  comboGroup?: string | null;
  currency?: string;
  vatAmount?: number;
  vatName?: string | null;
  vatTaxCode?: string | null;
  vatAddress?: string | null;
  vatEmail?: string | null;
  ticketSignature?: string | null;
  checkedInAt?: string | null;
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
  videos?: string[];
  verifiedTrip?: boolean;
  helpfulCount: number;
  hidden?: boolean;
  adminReply?: string | null;
  adminRepliedAt?: string | null;
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
