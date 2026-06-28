import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { analyticsHandler } from '../controllers/analytics.controller';

const router = Router();

router.get('/', asyncHandler(analyticsHandler));

export default router;
