import { Router } from 'express';
import * as c from '../controllers/contact.controller.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { asyncHandler } from '../utils/helpers.js';
import { rateLimit } from '../middleware/security.js';
import { z } from 'zod';

const createContactSchema = z.object({
  name: z.string().min(2, 'Name is required').max(100),
  email: z.string().email('Invalid email').max(255),
  phone: z
    .string()
    .regex(/^[0-9+\s-]{8,20}$/, 'Invalid phone number')
    .optional()
    .or(z.literal('')),
  message: z.string().min(10, 'Message is too short').max(2000),
});

const setReadSchema = z.object({ isRead: z.boolean() });

const router = Router();
// Public inbox drop-off — same throttling pattern as coupon validation.
router.post('/', rateLimit({ windowMs: 60 * 1000, max: 20, name: 'contact' }), validateBody(createContactSchema), c.create);

router.use(requireAuth, asyncHandler(requireAdmin));
router.get('/', c.list);
router.patch('/:id', validateBody(setReadSchema), c.setRead);
router.delete('/:id', c.remove);
export default router;
