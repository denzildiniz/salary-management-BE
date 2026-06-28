import { Request, Response } from 'express';
import {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getExportRows,
  importEmployeesFromCsv,
  applyBulkRaise,
} from '../services/employee.service';
import { EXCHANGE_RATES } from '../config';
import type { EmployeeFilters, CreateEmployeeInput } from '../types';

function parseFilters(query: Request['query']): EmployeeFilters {
  return {
    search: (query.search as string) || '',
    department: (query.department as string) || '',
    country: (query.country as string) || '',
    minSalary: parseFloat(query.minSalary as string) || 0,
    maxSalary: parseFloat(query.maxSalary as string) || Number.MAX_VALUE,
  };
}

function validateEmployeeBody(body: Record<string, unknown>): string | null {
  const requiredFields = [
    'first_name', 'last_name', 'email', 'job_title',
    'department', 'salary', 'currency', 'country', 'date_of_joining', 'gender',
  ];
  for (const field of requiredFields) {
    if (!body[field]) return `Missing required field: ${field}`;
  }
  if (isNaN(Number(body.salary)) || Number(body.salary) <= 0) {
    return 'Salary must be a positive number';
  }
  if (!EXCHANGE_RATES[(body.currency as string).toUpperCase()]) {
    return `Unsupported currency: ${body.currency}`;
  }
  const rating = parseInt(body.performance_rating as string);
  if (body.performance_rating !== undefined && !isNaN(rating) && (rating < 1 || rating > 5)) {
    return 'Performance rating must be between 1 and 5';
  }
  return null;
}

function buildEmployeeInput(body: Record<string, unknown>): CreateEmployeeInput {
  return {
    first_name: body.first_name as string,
    last_name: body.last_name as string,
    email: body.email as string,
    job_title: body.job_title as string,
    department: body.department as string,
    salary: Number(body.salary),
    currency: (body.currency as string).toUpperCase(),
    country: body.country as string,
    date_of_joining: body.date_of_joining as string,
    performance_rating: parseInt(body.performance_rating as string) || 3,
    gender: body.gender as string,
  };
}

export async function getEmployees(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
  const sortBy = (req.query.sortBy as string) || 'id';
  const sortOrder = (req.query.sortOrder as string)?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const result = await listEmployees(parseFilters(req.query), page, limit, sortBy, sortOrder as 'ASC' | 'DESC');
  res.json(result);
}

export async function getEmployee(req: Request, res: Response): Promise<void> {
  const employee = await getEmployeeById(req.params.id);
  if (!employee) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json(employee);
}

export async function createEmployeeHandler(req: Request, res: Response): Promise<void> {
  const validationError = validateEmployeeBody(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  const employee = await createEmployee(buildEmployeeInput(req.body));
  res.status(201).json(employee);
}

export async function updateEmployeeHandler(req: Request, res: Response): Promise<void> {
  const validationError = validateEmployeeBody(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  const employee = await updateEmployee(req.params.id, buildEmployeeInput(req.body));
  if (!employee) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json(employee);
}

export async function deleteEmployeeHandler(req: Request, res: Response): Promise<void> {
  const deleted = await deleteEmployee(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json({ message: 'Employee deleted successfully' });
}

export async function exportEmployees(req: Request, res: Response): Promise<void> {
  const rows = await getExportRows(parseFilters(req.query));

  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csvHeader = 'employee_id,first_name,last_name,email,job_title,department,salary,currency,country,date_of_joining,performance_rating,gender,previous_salary\n';
  const csvBody = rows.map(r => [
    escapeCell(r.employee_id), escapeCell(r.first_name), escapeCell(r.last_name),
    escapeCell(r.email), escapeCell(r.job_title), escapeCell(r.department),
    r.salary, escapeCell(r.currency), escapeCell(r.country),
    escapeCell(r.date_of_joining), r.performance_rating, escapeCell(r.gender),
    r.previous_salary ?? '',
  ].join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=employees_export.csv');
  res.send(csvHeader + csvBody);
}

export async function importEmployees(req: Request, res: Response): Promise<void> {
  const csvContent = req.body;
  if (typeof csvContent !== 'string' || !csvContent) {
    res.status(400).json({ error: 'Request body must be a non-empty CSV text string.' });
    return;
  }

  const result = await importEmployeesFromCsv(csvContent);
  if (result.errors.length > 0) {
    res.status(400).json({ error: 'Validation failed on CSV input.', details: result.errors });
    return;
  }
  res.json({
    success: true,
    insertedOrUpdated: result.insertedOrUpdated,
    message: `Successfully processed ${result.insertedOrUpdated} CSV employee records.`,
  });
}

export async function bulkRaiseHandler(req: Request, res: Response): Promise<void> {
  const { department, country, raiseType, value, isPreview } = req.body;

  if (!raiseType || value === undefined || isNaN(Number(value))) {
    res.status(400).json({ error: 'Missing or invalid raise details' });
    return;
  }
  if (raiseType === 'percentage' && Number(value) <= -100) {
    res.status(400).json({ error: 'Percentage raise must be greater than -100%' });
    return;
  }

  const result = await applyBulkRaise({
    department,
    country,
    raiseType: raiseType as 'percentage' | 'flat',
    value: Number(value),
    isPreview: Boolean(isPreview),
  });
  res.json(result);
}
