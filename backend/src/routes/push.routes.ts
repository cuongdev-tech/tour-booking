import { Router } from 'express';
import * as c from '../controllers/push.controller.js';
import { requireActiveUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { asyncHandler } from '../utils/helpers.js';
import { pushSchema } from '../validators/schemas.js';

const router = Router();
router.use(requireAuth);
router.use(asyncHandler(requireActiveUser));
router.post('/subscribe', validateBody(pushSchema), c.subscribe);
router.delete('/unsubscribe', c.unsubscribe);
router.get('/mine', c.mine);
router.get('/vapid-key', c.vapidKey);
export default router;
