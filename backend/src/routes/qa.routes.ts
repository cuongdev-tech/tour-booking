import { Router } from 'express';
import * as c from '../controllers/qa.controller.js';
import { requireActiveUser, requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { asyncHandler } from '../utils/helpers.js';
import { answerSchema, questionSchema, updateReviewVisibilitySchema } from '../validators/schemas.js';

const router = Router();
router.get('/tours/:tourId/questions', c.list);
router.post(
  '/tours/:tourId/questions',
  requireAuth,
  asyncHandler(requireActiveUser),
  validateBody(questionSchema),
  c.ask,
);

export const adminRouter = Router();
adminRouter.use(requireAuth, asyncHandler(requireAdmin));
adminRouter.patch('/questions/:id/answer', validateBody(answerSchema), c.answer);
adminRouter.patch('/questions/:id/hide', validateBody(updateReviewVisibilitySchema), c.setHidden);
adminRouter.delete('/questions/:id', c.remove);

export default router;
