import { Router } from 'express';
import * as c from '../controllers/combo.controller.js';
import { requireActiveUser, requireAdmin, requireAuth, requireCustomer, requireVerifiedEmail } from '../middleware/auth.js';
import { validateBody } from '../middleware/common.js';
import { asyncHandler } from '../utils/helpers.js';
import { bookComboSchema, comboSchema, patchComboSchema } from '../validators/schemas.js';

const router = Router();
router.get('/', c.list);
router.get('/group/:group', requireAuth, asyncHandler(requireActiveUser), c.group);
router.get('/:slug', c.detail);
router.post(
  '/:id/book',
  requireAuth,
  asyncHandler(requireActiveUser),
  asyncHandler(requireCustomer),
  asyncHandler(requireVerifiedEmail),
  validateBody(bookComboSchema),
  c.book,
);
export default router;

export const adminRouter = Router();
adminRouter.use(requireAuth, asyncHandler(requireAdmin));
adminRouter.get('/', c.adminList);
adminRouter.post('/', validateBody(comboSchema), c.create);
adminRouter.patch('/:id', validateBody(patchComboSchema), c.update);
adminRouter.delete('/:id', c.remove);
