import { Router } from 'express';
import * as c from '../controllers/review.controller.js';
import { requireActiveUser, requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { createReviewSchema, updateReviewSchema } from '../validators/schemas.js';
import { asyncHandler } from '../utils/helpers.js';

const router = Router();
router.get('/tour/:tourId', c.listByTour);
router.get('/mine', requireAuth, asyncHandler(requireActiveUser), c.mine);
router.post('/', requireAuth, asyncHandler(requireActiveUser), asyncHandler(requireVerifiedEmail), validateBody(createReviewSchema), c.create);
router.patch('/:id', requireAuth, asyncHandler(requireActiveUser), validateBody(updateReviewSchema), c.update);
router.delete('/:id', requireAuth, asyncHandler(requireActiveUser), c.remove);
router.post('/:id/helpful', requireAuth, asyncHandler(requireActiveUser), c.helpful);
export default router;
