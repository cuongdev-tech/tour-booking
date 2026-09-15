import { Router } from 'express';
import * as c from '../controllers/favorite.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
router.get('/', c.list);
router.post('/:tourId', c.add);
router.delete('/:tourId', c.remove);
export default router;
