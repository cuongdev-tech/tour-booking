import { Router } from 'express';
import * as c from '../controllers/review.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { createReviewSchema } from '../validators/schemas.js';

const router = Router();
router.get('/tour/:tourId', c.listByTour);
router.post('/', requireAuth, validateBody(createReviewSchema), c.create);
export default router;
