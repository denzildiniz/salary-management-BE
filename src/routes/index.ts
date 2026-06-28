import { Router } from 'express';
import employeeRoutes from './employee.routes';
import analyticsRoutes from './analytics.routes';
import queryRoutes from './query.routes';

const router = Router();

router.use('/employees', employeeRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/query', queryRoutes);

export default router;
