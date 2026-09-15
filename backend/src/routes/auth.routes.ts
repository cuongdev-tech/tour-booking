import { Router } from 'express';
import * as c from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { loginSchema, registerSchema, updateProfileSchema } from '../validators/schemas.js';

const router = Router();
router.post('/register', validateBody(registerSchema), c.register);
router.post('/login', validateBody(loginSchema), c.login);
router.get('/me', requireAuth, c.me);
router.patch('/me', requireAuth, validateBody(updateProfileSchema), c.updateProfile);
export default router;
