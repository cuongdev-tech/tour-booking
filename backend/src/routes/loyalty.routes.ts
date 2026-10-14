import { Router } from 'express';
import * as c from '../controllers/loyalty.controller.js';
import { requireActiveUser, requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/helpers.js';

const router = Router();
router.use(requireAuth);
router.use(asyncHandler(requireActiveUser));
router.get('/me', c.me);
export default router;
