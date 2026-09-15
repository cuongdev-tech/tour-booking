import { Router } from 'express';
import * as c from '../controllers/tour.controller.js';

const router = Router();
router.get('/', c.list);
router.get('/destinations', c.destinations);
router.get('/:id', c.detail);
export default router;
