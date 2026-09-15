import { z } from 'zod';

const email = z.string().email('Invalid email').max(255);
const password = z.string().min(6, 'Password must be at least 6 characters').max(100);
const phone = z
  .string()
  .regex(/^[0-9+\s-]{8,20}$/, 'Invalid phone number')
  .optional()
  .or(z.literal(''));

export const registerSchema = z.object({
  name: z.string().min(2, 'Name is required').max(100),
  email,
  password,
  phone: phone.optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: phone.optional(),
  avatar: z.string().url().optional().or(z.literal('')),
});

const guestSchema = z.object({
  fullName: z.string().min(2, 'Guest name is required').max(100),
  dateOfBirth: z.string().datetime().optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  phone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
});

export const createBookingSchema = z.object({
  tourId: z.string().min(1, 'tourId is required'),
  travelDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid travel date'),
  customerName: z.string().min(2).max(100),
  customerEmail: z.string().email(),
  customerPhone: z.string().regex(/^[0-9+\s-]{8,20}$/, 'Invalid phone number'),
  note: z.string().max(1000).optional().or(z.literal('')),
  couponCode: z.string().max(50).optional().or(z.literal('')),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD']),
  guestsList: z.array(guestSchema).min(1, 'At least one guest is required').max(30),
});

export const validateCouponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required'),
  subtotal: z.number().int().positive('Invalid subtotal'),
});

export const createReviewSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().or(z.literal('')),
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
  minGuests: z.number().int().min(1).default(1),
  maxGuests: z.number().int().min(1).max(100).default(20),
  availableSeats: z.number().int().min(0).default(30),
  featured: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  itinerary: itinerarySchema,
});

export const upsertTourSchema = baseTourSchema.superRefine((v, ctx) =>
  checkItineraryMatchesDuration(ctx, v.duration, v.itinerary),
);

export const patchTourSchema = baseTourSchema.partial().superRefine((v, ctx) =>
  checkItineraryMatchesDuration(ctx, v.duration, v.itinerary),
);

export const upsertCouponSchema = z.object({
  code: z.string().min(3).max(50),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().positive(),
  minOrder: z.number().int().min(0).default(0),
  expiresAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid expiry date'),
  usageLimit: z.number().int().positive().optional().nullable(),
  active: z.boolean().default(true),
});

export const patchCouponSchema = upsertCouponSchema.partial().omit({ code: true });

export const updateBookingStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']),
});

export const updateUserSchema = z.object({
  role: z.enum(['CUSTOMER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
