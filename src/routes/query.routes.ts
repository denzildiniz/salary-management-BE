import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { naturalQueryHandler } from '../controllers/analytics.controller';

const router = Router();

router.get('/', asyncHandler(naturalQueryHandler));

export default router;
