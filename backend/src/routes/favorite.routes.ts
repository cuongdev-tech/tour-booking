import { Router } from 'express';
import * as c from '../controllers/favorite.controller.js';
import { requireActiveUser, requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/helpers.js';

const router = Router();
router.use(requireAuth);
router.use(asyncHandler(requireActiveUser));
router.get('/', c.list);
router.get('/:tourId/check', c.check);
router.post('/:tourId', c.add);
router.delete('/:tourId', c.remove);
export default router;
