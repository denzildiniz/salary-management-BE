import { getDb } from '../db';
import { EXCHANGE_RATES, convertToUsd } from '../config';
import { USD_CONVERSION_SQL } from '../constants/sql';
import type {
  Employee,
  EmployeeWithUsd,
  EmployeeFilters,
  PaginatedResult,
  CreateEmployeeInput,
  BulkRaiseParams,
  BulkRaiseResult,
  ImportResult,
} from '../types';

const ALLOWED_SORT_COLUMNS = new Set([
  'id', 'employee_id', 'first_name', 'last_name', 'email',
  'job_title', 'department', 'salary', 'currency', 'country',
  'date_of_joining', 'performance_rating', 'gender', 'salary_usd',
]);

function buildWhereClause(filters: EmployeeFilters): { whereClause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.search) {
    conditions.push(`(first_name || ' ' || last_name LIKE ? OR email LIKE ? OR job_title LIKE ? OR employee_id LIKE ?)`);
    const s = `%${filters.search}%`;
    params.push(s, s, s, s);
  }
  if (filters.department) {
    conditions.push('department = ?');
    params.push(filters.department);
  }
  if (filters.country) {
    conditions.push('country = ?');
    params.push(filters.country);
  }
  if (filters.minSalary > 0 || filters.maxSalary < Number.MAX_VALUE) {
    conditions.push(`(${USD_CONVERSION_SQL}) >= ? AND (${USD_CONVERSION_SQL}) <= ?`);
    params.push(filters.minSalary, filters.maxSalary);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

export async function listEmployees(
  filters: EmployeeFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: 'ASC' | 'DESC',
): Promise<PaginatedResult> {
  const db = await getDb();
  const offset = (page - 1) * limit;

  const resolvedSort = ALLOWED_SORT_COLUMNS.has(sortBy)
    ? sortBy === 'salary_usd' ? `(${USD_CONVERSION_SQL})` : sortBy
    : 'id';

  const { whereClause, params } = buildWhereClause(filters);

  const countRow = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM employees ${whereClause}`,
    params,
  );
  const totalCount = countRow?.count ?? 0;

  const rows = await db.all<EmployeeWithUsd[]>(
    `SELECT id, employee_id, first_name, last_name, email, job_title, department,
            salary, currency, country, date_of_joining, performance_rating, gender, previous_salary,
            (${USD_CONVERSION_SQL}) as salary_usd
     FROM employees
     ${whereClause}
     ORDER BY ${resolvedSort} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return {
    employees: rows,
    pagination: {
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}

export async function getEmployeeById(id: string): Promise<EmployeeWithUsd | undefined> {
  const db = await getDb();
  return db.get<EmployeeWithUsd>(
    `SELECT *, (${USD_CONVERSION_SQL}) as salary_usd FROM employees WHERE id = ?`,
    [id],
  );
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const db = await getDb();

  const maxRow = await db.get<{ max_num: number }>(
    'SELECT MAX(CAST(SUBSTR(employee_id, 5) AS INTEGER)) as max_num FROM employees',
  );
  const nextNum = (maxRow?.max_num ?? 0) + 1;
  const employee_id = `EMP-${String(nextNum).padStart(5, '0')}`;

  const result = await db.run(
    `INSERT INTO employees (
       employee_id, first_name, last_name, email, job_title, department,
       salary, currency, country, date_of_joining, performance_rating, gender
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      employee_id, input.first_name, input.last_name, input.email,
      input.job_title, input.department, input.salary, input.currency,
      input.country, input.date_of_joining, input.performance_rating, input.gender,
    ],
  );

  return db.get<Employee>('SELECT * FROM employees WHERE id = ?', [result.lastID]) as Promise<Employee>;
}

export async function updateEmployee(
  id: string,
  input: CreateEmployeeInput,
): Promise<Employee | undefined> {
  const db = await getDb();

  const existing = await db.get<Employee>('SELECT * FROM employees WHERE id = ?', [id]);
  if (!existing) return undefined;

  const previous_salary = existing.salary !== input.salary ? existing.salary : existing.previous_salary;

  await db.run(
    `UPDATE employees
     SET first_name = ?, last_name = ?, email = ?, job_title = ?, department = ?,
         salary = ?, currency = ?, country = ?, date_of_joining = ?, performance_rating = ?,
         gender = ?, previous_salary = ?
     WHERE id = ?`,
    [
      input.first_name, input.last_name, input.email, input.job_title, input.department,
      input.salary, input.currency, input.country, input.date_of_joining,
      input.performance_rating, input.gender, previous_salary, id,
    ],
  );

  return db.get<Employee>('SELECT * FROM employees WHERE id = ?', [id]);
}

export async function deleteEmployee(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.run('DELETE FROM employees WHERE id = ?', [id]);
  return (result.changes ?? 0) > 0;
}

export async function getExportRows(filters: EmployeeFilters): Promise<Employee[]> {
  const db = await getDb();
  const { whereClause, params } = buildWhereClause(filters);

  return db.all<Employee[]>(
    `SELECT employee_id, first_name, last_name, email, job_title, department,
            salary, currency, country, date_of_joining, performance_rating, gender, previous_salary
     FROM employees
     ${whereClause}
     ORDER BY employee_id ASC`,
    params,
  );
}

interface ImportRow {
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string;
  department: string;
  salary: number;
  currency: string;
  country: string;
  date_of_joining: string;
  performance_rating: number;
  gender: string;
  previous_salary: number | null;
}

export async function importEmployeesFromCsv(csvContent: string): Promise<ImportResult> {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV must contain a header row and at least one data row.');
  }

  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  const requiredHeaders = [
    'first_name', 'last_name', 'email', 'job_title', 'department',
    'salary', 'currency', 'country', 'date_of_joining', 'gender',
  ];
  const missingHeaders = requiredHeaders.filter(h => !header.includes(h));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV missing required headers: ${missingHeaders.join(', ')}`);
  }

  const idx = (col: string) => header.indexOf(col);
  const errors: string[] = [];
  const validRows: ImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const matches = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) ?? lines[i].split(',');
    const cols = matches.map(c => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

    if (cols.length < requiredHeaders.length) {
      errors.push(`Row ${i + 1}: Insufficient columns (got ${cols.length}).`);
      continue;
    }

    const first_name = cols[idx('first_name')];
    const last_name = cols[idx('last_name')];
    const email = cols[idx('email')];
    const job_title = cols[idx('job_title')];
    const department = cols[idx('department')];
    const rawSalary = cols[idx('salary')];
    const currency = cols[idx('currency')]?.toUpperCase();
    const country = cols[idx('country')];
    const date_of_joining = cols[idx('date_of_joining')];
    const gender = cols[idx('gender')];

    if (!first_name || !last_name || !email || !job_title || !department || !rawSalary || !currency || !country || !date_of_joining || !gender) {
      errors.push(`Row ${i + 1}: Missing required fields.`);
      continue;
    }

    const salary = Number(rawSalary);
    if (isNaN(salary) || salary <= 0) {
      errors.push(`Row ${i + 1}: Salary must be a positive number (got '${rawSalary}').`);
      continue;
    }

    if (!EXCHANGE_RATES[currency]) {
      errors.push(`Row ${i + 1}: Unsupported currency '${currency}'.`);
      continue;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date_of_joining)) {
      errors.push(`Row ${i + 1}: Invalid date_of_joining format — expected YYYY-MM-DD.`);
      continue;
    }

    const ratingIdx = idx('performance_rating');
    const performance_rating = ratingIdx !== -1 ? parseInt(cols[ratingIdx]) || 3 : 3;
    if (performance_rating < 1 || performance_rating > 5) {
      errors.push(`Row ${i + 1}: performance_rating must be between 1 and 5.`);
      continue;
    }

    const empIdIdx = idx('employee_id');
    const prevSalIdx = idx('previous_salary');

    validRows.push({
      employee_id: empIdIdx !== -1 ? cols[empIdIdx] : '',
      first_name, last_name, email, job_title, department,
      salary, currency, country, date_of_joining, performance_rating, gender,
      previous_salary: prevSalIdx !== -1 && cols[prevSalIdx] !== '' ? Number(cols[prevSalIdx]) : null,
    });
  }

  if (errors.length > 0) {
    return { insertedOrUpdated: 0, errors };
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION;');
  try {
    const maxRow = await db.get<{ max_num: number }>(
      'SELECT MAX(CAST(SUBSTR(employee_id, 5) AS INTEGER)) as max_num FROM employees',
    );
    let nextNum = (maxRow?.max_num ?? 0) + 1;

    for (const row of validRows) {
      let empId = row.employee_id;
      let existing: { id: number } | undefined;

      if (empId) {
        existing = await db.get<{ id: number }>('SELECT id FROM employees WHERE employee_id = ?', [empId]);
      }

      if (existing) {
        await db.run(
          `UPDATE employees
           SET first_name = ?, last_name = ?, email = ?, job_title = ?, department = ?,
               salary = ?, currency = ?, country = ?, date_of_joining = ?, performance_rating = ?,
               gender = ?, previous_salary = ?
           WHERE employee_id = ?`,
          [
            row.first_name, row.last_name, row.email, row.job_title, row.department,
            row.salary, row.currency, row.country, row.date_of_joining, row.performance_rating,
            row.gender, row.previous_salary, empId,
          ],
        );
      } else {
        if (!empId) {
          empId = `EMP-${String(nextNum).padStart(5, '0')}`;
          nextNum++;
        }
        await db.run(
          `INSERT INTO employees (
             employee_id, first_name, last_name, email, job_title, department,
             salary, currency, country, date_of_joining, performance_rating, gender, previous_salary
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            empId, row.first_name, row.last_name, row.email, row.job_title, row.department,
            row.salary, row.currency, row.country, row.date_of_joining, row.performance_rating,
            row.gender, row.previous_salary,
          ],
        );
      }
    }

    await db.run('COMMIT;');
    return { insertedOrUpdated: validRows.length, errors: [] };
  } catch (err) {
    await db.run('ROLLBACK;');
    throw err;
  }
}

export async function applyBulkRaise(params: BulkRaiseParams): Promise<BulkRaiseResult> {
  const db = await getDb();
  const conditions: string[] = [];
  const queryParams: unknown[] = [];

  if (params.department) {
    conditions.push('department = ?');
    queryParams.push(params.department);
  }
  if (params.country) {
    conditions.push('country = ?');
    queryParams.push(params.country);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  type CohortRow = { id: number; salary: number; currency: string; salary_usd: number };
  const cohort = await db.all<CohortRow[]>(
    `SELECT id, salary, currency, (${USD_CONVERSION_SQL}) as salary_usd FROM employees ${whereClause}`,
    queryParams,
  );

  if (cohort.length === 0) {
    return {
      isPreview: params.isPreview,
      affectedCount: 0,
      originalTotalSpendUsd: 0,
      newTotalSpendUsd: 0,
      differenceUsd: 0,
    };
  }

  const computeNewSalary = (empSalary: number): number => {
    const raw = params.raiseType === 'percentage'
      ? empSalary * (1 + params.value / 100)
      : empSalary + params.value;
    return Math.max(0, raw);
  };

  let originalTotalSpendUsd = 0;
  let newTotalSpendUsd = 0;

  for (const emp of cohort) {
    originalTotalSpendUsd += emp.salary_usd;
    newTotalSpendUsd += convertToUsd(computeNewSalary(emp.salary), emp.currency);
  }

  const differenceUsd = newTotalSpendUsd - originalTotalSpendUsd;

  if (params.isPreview) {
    return { isPreview: true, affectedCount: cohort.length, originalTotalSpendUsd, newTotalSpendUsd, differenceUsd };
  }

  await db.run('BEGIN TRANSACTION;');
  try {
    for (const emp of cohort) {
      let newSalary = computeNewSalary(emp.salary);
      newSalary = newSalary > 100000
        ? Math.round(newSalary / 1000) * 1000
        : Math.round(newSalary / 100) * 100;

      await db.run(
        'UPDATE employees SET previous_salary = salary, salary = ? WHERE id = ?',
        [newSalary, emp.id],
      );
    }
    await db.run('COMMIT;');
  } catch (err) {
    await db.run('ROLLBACK;');
    throw err;
  }

  return {
    isPreview: false,
    affectedCount: cohort.length,
    originalTotalSpendUsd,
    newTotalSpendUsd,
    differenceUsd,
    message: `Successfully applied raises to ${cohort.length} employees.`,
  };
}
