import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import {
  getEmployees,
  getEmployee,
  createEmployeeHandler,
  updateEmployeeHandler,
  deleteEmployeeHandler,
  exportEmployees,
  importEmployees,
  bulkRaiseHandler,
} from '../controllers/employee.controller';

const router = Router();

// Static routes must be registered before /:id to avoid shadowing
router.get('/export', asyncHandler(exportEmployees));
router.post('/bulk-raise', asyncHandler(bulkRaiseHandler));
router.post('/import', asyncHandler(importEmployees));

router.get('/', asyncHandler(getEmployees));
router.get('/:id', asyncHandler(getEmployee));
router.post('/', asyncHandler(createEmployeeHandler));
router.put('/:id', asyncHandler(updateEmployeeHandler));
router.delete('/:id', asyncHandler(deleteEmployeeHandler));

export default router;
