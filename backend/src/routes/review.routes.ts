import { Router } from 'express';
import * as c from '../controllers/review.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { createReviewSchema, updateReviewSchema } from '../validators/schemas.js';

const router = Router();
router.get('/tour/:tourId', c.listByTour);
router.get('/mine', requireAuth, c.mine);
router.post('/', requireAuth, validateBody(createReviewSchema), c.create);
router.patch('/:id', requireAuth, validateBody(updateReviewSchema), c.update);
router.delete('/:id', requireAuth, c.remove);
router.post('/:id/helpful', requireAuth, c.helpful);
export default router;
