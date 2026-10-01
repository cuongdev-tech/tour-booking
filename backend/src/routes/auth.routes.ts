import { Router } from 'express';
import * as c from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, updateProfileSchema } from '../validators/schemas.js';
import { rateLimit } from '../middleware/security.js';

// Brute-force guard on credential endpoints (per IP, in-memory).
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, name: 'auth' });

const router = Router();
router.post('/register', authLimiter, validateBody(registerSchema), c.register);
router.post('/login', authLimiter, validateBody(loginSchema), c.login);
router.post('/forgot-password', authLimiter, validateBody(forgotPasswordSchema), c.forgotPassword);
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), c.resetPassword);
router.get('/me', requireAuth, c.me);
router.patch('/me', requireAuth, validateBody(updateProfileSchema), c.updateProfile);
export default router;
