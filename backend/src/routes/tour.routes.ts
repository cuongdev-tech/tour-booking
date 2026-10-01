import { Router } from 'express';
import * as c from '../controllers/tour.controller.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();
router.get('/', c.list);
router.get('/destinations', c.destinations);
router.get('/recommended', optionalAuth, c.recommended);
router.get('/:id/availability', c.availability);
router.get('/:id', c.detail);
export default router;
