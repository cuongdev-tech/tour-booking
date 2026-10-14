import type { Request, Response } from 'express';
import { validateCouponForDisplay } from '../services/coupon.service.js';
import { asyncHandler } from '../utils/helpers.js';

export const validate = asyncHandler(async (req: Request, res: Response) => {
  const { coupon, discount } = await validateCouponForDisplay(req.body.code, req.body.subtotal, {
    tourId: req.body.tourId,
    category: req.body.category,
    guests: req.body.guests,
  });
  res.json({ valid: true, coupon: { code: coupon.code, type: coupon.type, value: coupon.value }, discount });
});
