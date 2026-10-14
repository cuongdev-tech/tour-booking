import { Router } from 'express';
import * as c from '../controllers/blog.controller.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { asyncHandler } from '../utils/helpers.js';
import { patchPostSchema, postSchema } from '../validators/schemas.js';

const router = Router();
router.get('/', c.publicList);
router.get('/:slug', c.publicDetail);

export const adminRouter = Router();
adminRouter.use(requireAuth, asyncHandler(requireAdmin));
adminRouter.get('/', c.adminList);
adminRouter.post('/', validateBody(postSchema), c.create);
adminRouter.patch('/:id', validateBody(patchPostSchema), c.update);
adminRouter.delete('/:id', c.remove);

export default router;
