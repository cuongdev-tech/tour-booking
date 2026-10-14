import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Invalid email').max(255);
const password = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(100)
  .refine((s) => s.trim().length >= 6, 'Password must be at least 6 characters');
// Whitespace-only strings must fail: regex alone accepts "        ".
const phone = z
  .string()
  .regex(/^[0-9+\s-]{8,20}$/, 'Invalid phone number')
  .refine((s) => (s.match(/[0-9]/g) ?? []).length >= 6, 'Invalid phone number')
  .optional()
  .or(z.literal(''));

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(100),
  email,
  password,
  phone: phone.optional(),
  referralCode: z.string().trim().max(20).optional().or(z.literal('')),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export const resendVerificationSchema = z.object({
  email,
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: phone.optional(),
  avatar: z.string().url().optional().or(z.literal('')),
});

const guestSchema = z.object({
  fullName: z.string().trim().min(2, 'Guest name is required').max(100),
  // Date-only (YYYY-MM-DD, as sent by <input type="date">) or full ISO.
  // Future DOB is rejected here (adult with unborn DOB); child age window
  // vs travelDate is enforced in assertChildAges.
  dateOfBirth: z
    .string()
    .refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Invalid date of birth')
    .refine((v) => v === '' || v === undefined || new Date(v).getTime() <= Date.now(), 'Invalid date of birth')
    .optional()
    .or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  isChild: z.boolean().default(false),
  phone: z
    .string()
    .regex(/^[0-9+\s-]{8,20}$/, 'Invalid phone number')
    .refine((s) => (s.match(/[0-9]/g) ?? []).length >= 6, 'Invalid phone number')
    .optional()
    .or(z.literal('')),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
});

export const createBookingSchema = z.object({
  tourId: z.string().min(1, 'tourId is required'),
  travelDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid travel date'),
  customerName: z.string().trim().min(2).max(100),
  customerEmail: z.string().trim().toLowerCase().email(),
  customerPhone: z
    .string()
    .regex(/^[0-9+\s-]{8,20}$/, 'Invalid phone number')
    .refine((s) => (s.match(/[0-9]/g) ?? []).length >= 6, 'Invalid phone number'),
  note: z.string().max(1000).optional().or(z.literal('')),
  couponCode: z.string().max(50).optional().or(z.literal('')),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD']),
  guestsList: z.array(guestSchema).min(1, 'At least one guest is required').max(100),
  addons: z.array(z.string().min(1).max(60)).max(20).optional().default([]),
  loyaltyPoints: z.number().int().min(0).max(100000).optional().default(0),
  isPrivate: z.boolean().optional().default(false),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Invalid currency').optional().default('VND'),
  vat: z.object({
    name: z.string().trim().max(200).optional().or(z.literal('')),
    taxCode: z.string().trim().max(30).optional().or(z.literal('')),
    address: z.string().trim().max(300).optional().or(z.literal('')),
    email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  }).optional(),
});

export const validateCouponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required'),
  subtotal: z.number().int().positive('Invalid subtotal'),
  tourId: z.string().min(1).optional(),
  category: z.enum(['Beach', 'Mountains', 'Culture', 'Relaxation']).optional(),
  guests: z.number().int().min(1).max(100).optional(),
});

export const updateBookingSchema = z.object({
  travelDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid travel date').optional(),
  guestsList: z.array(guestSchema).min(1, 'At least one guest is required').max(100).optional(),
  customerName: z.string().trim().min(2).max(100).optional(),
  customerEmail: z.string().trim().toLowerCase().email().optional(),
  customerPhone: z
    .string()
    .regex(/^[0-9+\s-]{8,20}$/, 'Invalid phone number')
    .refine((s) => (s.match(/[0-9]/g) ?? []).length >= 6, 'Invalid phone number')
    .optional(),
  note: z.string().max(1000).nullable().optional(),
});

const reviewImageSchema = z.union([
  z.string().url(),
  z.string().regex(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, 'Invalid image'),
]).refine((s) => s.length <= 700_000, 'Image is too large');

const reviewVideoSchema = z.string().url('Invalid video URL').max(500);

export const createReviewSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().or(z.literal('')),
  images: z.array(reviewImageSchema).max(3).optional().default([]),
  videos: z.array(reviewVideoSchema).max(1).optional().default([]),
});

export const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).nullable().optional().or(z.literal('')),
  images: z.array(reviewImageSchema).max(3).optional(),
  videos: z.array(reviewVideoSchema).max(1).optional(),
});

export const tourDateSchema = z.object({
  date: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid travel date')
    .refine((v) => {
      const d = new Date(v);
      const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const n = new Date();
      const today = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
      return day >= today;
    }, 'Invalid travel date'),
  capacity: z.number().int().min(1).max(1000),
  guideId: z.string().min(1).max(60).optional().nullable(),
  vehicleId: z.string().min(1).max(60).optional().nullable(),
});

export const guideSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
});

export const patchGuideSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(20).nullable().optional().or(z.literal('')),
  active: z.boolean().optional(),
});

export const vehicleSchema = z.object({
  plate: z.string().trim().min(3).max(20),
  type: z.string().trim().min(2).max(40).optional().default('Bus'),
  seats: z.number().int().min(1).max(100),
});

export const patchVehicleSchema = z.object({
  plate: z.string().trim().min(3).max(20).optional(),
  type: z.string().trim().min(2).max(40).optional(),
  seats: z.number().int().min(1).max(100).optional(),
  active: z.boolean().optional(),
});

export const setReadSchema = z.object({
  isRead: z.boolean(),
});

const transportationMode = z.enum(['Flight', 'Bus', 'Coach', 'PrivateCar', 'LocalTransfer', 'Cruise']);

const serviceItem = z.string().min(2).max(200);

/** Number of days encoded at the start of a duration string, e.g. "3 ngày 2 đêm" -> 3, "1 ngày" -> 1. */
export function parseDurationDays(duration: string): number | null {
  const m = /^\s*(\d+)/.exec(duration ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 15 ? n : null;
}

export interface ItineraryDay {
  day: number;
  title: string;
  activities: string[];
}

const itineraryDaySchema = z.object({
  day: z.number().int().positive('Day must be a positive number'),
  title: z.string().trim().min(1, 'Day title is required').max(200),
  activities: z.array(z.string().trim().min(1, 'Activity must not be empty').max(300)).min(1, 'Each day needs at least one activity').max(12),
});

const itinerarySchema = z
  .array(itineraryDaySchema)
  .min(1, 'Itinerary must have at least one day')
  .max(15)
  .superRefine((days, ctx) => {
    const seen = new Set<number>();
    days.forEach((d, i) => {
      if (seen.has(d.day)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate day ${d.day}`, path: [i, 'day'] });
      }
      seen.add(d.day);
      if (d.day !== i + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Days must start at 1 and increase sequentially (expected day ${i + 1}, got ${d.day})`,
          path: [i, 'day'],
        });
      }
    });
  });

function checkItineraryMatchesDuration(
  ctx: z.RefinementCtx,
  duration: string | undefined,
  itinerary: ItineraryDay[] | undefined,
) {
  if (duration === undefined || itinerary === undefined) return;
  const expected = parseDurationDays(duration);
  if (expected !== null && itinerary.length !== expected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Itinerary has ${itinerary.length} day(s) but duration "${duration}" expects ${expected}`,
      path: ['itinerary'],
    });
  }
}

export interface TourAddon {
  id: string;
  name: string;
  price: number;
  perPerson: boolean;
}

const tourAddonSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(2).max(80),
  price: z.number().int().positive(),
  perPerson: z.boolean(),
});

function checkTourPricing(
  v: {
    price?: number;
    childPrice?: number | null;
    childMaxAge?: number | null;
    addons?: TourAddon[];
  },
  ctx: z.RefinementCtx,
): void {
  if (v.childPrice != null && v.price !== undefined && v.childPrice >= v.price) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `childPrice (${v.childPrice}) must be lower than price (${v.price})`,
      path: ['childPrice'],
    });
  }
  if (v.childMaxAge != null && v.childPrice == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'childMaxAge requires childPrice to be set',
      path: ['childMaxAge'],
    });
  }
  if (v.addons) {
    const seen = new Set<string>();
    v.addons.forEach((a, i) => {
      if (seen.has(a.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate add-on id "${a.id}"`, path: ['addons', i, 'id'] });
      }
      seen.add(a.id);
    });
  }
}

const priceTierSchema = z.object({
  minGuests: z.number().int().min(1).max(100),
  price: z.number().int().positive(),
  childPrice: z.number().int().positive().optional(),
});

const baseTourSchema = z.object({
  slug: z.string().min(2).max(120).optional(),
  title: z.string().min(4).max(200),
  description: z.string().min(10),
  category: z.enum(['Beach', 'Mountains', 'Culture', 'Relaxation']),
  departureLocation: z.string().min(2).max(100),
  destination: z.string().min(2).max(100),
  transportation: z.array(transportationMode).min(1).max(6),
  includedServices: z.array(serviceItem).min(1).max(30),
  excludedServices: z.array(serviceItem).min(1).max(30),
  images: z.array(z.string().url()).min(1).max(10),
  duration: z.string().min(2).max(50),
  price: z.number().int().positive(),
  childPrice: z.number().int().positive().nullish(),
  childMaxAge: z.number().int().min(1).max(17).nullish(),
  addons: z.array(tourAddonSchema).max(20).default([]),
  freeCancelHours: z.number().int().min(1).max(720).nullish(),
  minGuests: z.number().int().min(1).default(1),
  maxGuests: z.number().int().min(1).max(100).default(20),
  availableSeats: z.number().int().min(0).default(30),
  priceTiers: z.array(priceTierSchema).max(10).optional().default([]),
  privateAvailable: z.boolean().optional().default(false),
  privateSurcharge: z.number().int().min(0).optional().default(0),
  featured: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  departureHour: z.number().int().min(0).max(23).optional().nullable(),
  itinerary: itinerarySchema,
});

export const upsertTourSchema = baseTourSchema.superRefine((v, ctx) => {
  checkItineraryMatchesDuration(ctx, v.duration, v.itinerary);
  if (v.maxGuests < v.minGuests) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `maxGuests (${v.maxGuests}) must be >= minGuests (${v.minGuests})`,
      path: ['maxGuests'],
    });
  }
  checkTourPricing(v, ctx);
});

export const patchTourSchema = baseTourSchema.partial().superRefine((v, ctx) => {
  checkItineraryMatchesDuration(ctx, v.duration, v.itinerary);
  if (v.minGuests !== undefined && v.maxGuests !== undefined && v.maxGuests < v.minGuests) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `maxGuests (${v.maxGuests}) must be >= minGuests (${v.minGuests})`,
      path: ['maxGuests'],
    });
  }
  checkTourPricing(v, ctx);
});

const baseCouponSchema = z.object({
  code: z.string().min(3).max(50),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().positive(),
  minOrder: z.number().int().min(0).default(0),
  expiresAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid expiry date'),
  usageLimit: z.number().int().positive().optional().nullable(),
  active: z.boolean().default(true),
  applicableTourIds: z.array(z.string().min(1).max(60)).max(50).optional().default([]),
  applicableCategory: z.enum(['Beach', 'Mountains', 'Culture', 'Relaxation']).optional().nullable(),
  startsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid start date').optional().nullable(),
  maxDiscount: z.number().int().positive().optional().nullable(),
  minGuests: z.number().int().min(0).max(100).optional().default(0),
});

export const upsertCouponSchema = baseCouponSchema.superRefine(checkCouponValue);

export const patchCouponSchema = baseCouponSchema
  .partial()
  .omit({ code: true })
  .superRefine(checkCouponValue);

function checkCouponValue(
  v: { type?: 'PERCENT' | 'FIXED'; value?: number },
  ctx: z.RefinementCtx,
): void {
  // A percent over 100 would discount more than the subtotal (capped) — reject it outright.
  if (v.type === 'PERCENT' && v.value !== undefined && v.value > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Percent value must be between 1 and 100', path: ['value'] });
  }
}

export const updateBookingStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']),
});

export const updatePaymentStatusSchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'FAILED']),
});

export const updateReviewVisibilitySchema = z.object({
  hidden: z.boolean(),
});

export const replyReviewSchema = z.object({
  reply: z.string().trim().min(1, 'Reply must not be empty').max(2000),
});

export const updateUserSchema = z.object({
  role: z.enum(['CUSTOMER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const comboSchema = z.object({
  slug: z.string().min(2).max(120).optional(),
  title: z.string().trim().min(4).max(200),
  description: z.string().trim().min(10),
  tourIds: z.array(z.string().min(1)).min(2, 'Combo must include at least 2 tours').max(6, 'Combo allows at most 6 tours'),
  discountPercent: z.number().int().min(0).max(90).default(0),
  images: z.array(z.string().url()).max(8).default([]),
  featured: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const patchComboSchema = comboSchema.partial();

export const checkinSchema = z.object({
  code: z.string().trim().min(1, 'Booking code is required').max(30),
  signature: z.string().trim().max(200).optional().or(z.literal('')),
});

export const pushSchema = z.object({
  endpoint: z.string().url('Invalid push endpoint'),
  p256dh: z.string().min(10, 'Invalid push key'),
  auth: z.string().min(10, 'Invalid push key'),
});

// Combo booking takes its tour legs from the combo itself, so tourId is
// omitted. Everything else mirrors createBookingSchema.
export const bookComboSchema = createBookingSchema.omit({ tourId: true });

export const postSchema = z.object({
  slug: z.string().trim().min(2).max(120).optional(),
  title: z.string().trim().min(4).max(200),
  excerpt: z.string().trim().max(300).optional().default(''),
  content: z.string().trim().min(20),
  cover: z.string().trim().url().optional().or(z.literal('')),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional().default('DRAFT'),
  tourIds: z.array(z.string().trim().min(1).max(60)).max(10).optional().default([]),
});

export const patchPostSchema = postSchema.partial();

export const questionSchema = z.object({
  question: z.string().trim().min(5).max(1000),
});

export const answerSchema = z.object({
  answer: z.string().trim().min(1).max(2000).nullable(),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
