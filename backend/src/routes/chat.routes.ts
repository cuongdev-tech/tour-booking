import { Router } from 'express';
import * as c from '../controllers/chat.controller.js';
import { requireActiveUser, requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { asyncHandler } from '../utils/helpers.js';
import { messageSchema } from '../validators/schemas.js';

const router = Router();
const authed = [requireAuth, asyncHandler(requireActiveUser)] as const;
router.get('/bookings/:id/messages', ...authed, c.list);
router.post('/bookings/:id/messages', ...authed, validateBody(messageSchema), c.send);

export const adminRouter = Router();
adminRouter.use(requireAuth, asyncHandler(requireAdmin));
adminRouter.get('/threads', c.threads);

export default router;
