import { Router } from 'express';
import * as c from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { forgotPasswordSchema, loginSchema, registerSchema, resendVerificationSchema, resetPasswordSchema, updateProfileSchema, verifyEmailSchema } from '../validators/schemas.js';
import { forgotPasswordEmailThrottle, loginAccountThrottle, rateLimit } from '../middleware/security.js';

// Brute-force guards (per IP, Redis-shared when REDIS_URL is set, else memory).
// Login is additionally throttled per account (10/15m) so IP rotation can't
// brute-force one mailbox. Password flows are tighter (5/hour per IP).

const registerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, name: 'auth-register' });
const loginIpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, name: 'auth-login' });
const passwordLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, name: 'auth-password' });

const router = Router();
router.post('/register', registerLimiter, validateBody(registerSchema), c.register);
router.post('/login', loginIpLimiter, loginAccountThrottle, validateBody(loginSchema), c.login);
router.post('/forgot-password', passwordLimiter, forgotPasswordEmailThrottle, validateBody(forgotPasswordSchema), c.forgotPassword);
router.post('/reset-password', passwordLimiter, validateBody(resetPasswordSchema), c.resetPassword);
router.post('/verify-email', passwordLimiter, validateBody(verifyEmailSchema), c.verifyEmail);
router.post('/resend-verification', passwordLimiter, validateBody(resendVerificationSchema), c.resendVerification);
router.get('/me', requireAuth, c.me);
router.patch('/me', requireAuth, validateBody(updateProfileSchema), c.updateProfile);
router.post('/refresh', requireAuth, c.refresh);
router.post('/logout', requireAuth, c.logout);
export default router;
