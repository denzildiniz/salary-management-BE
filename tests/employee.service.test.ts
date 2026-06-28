import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { AsyncDatabase } from '../src/db';
import { createTestDb, teardownTestDb } from './helpers/testDb';
import {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  applyBulkRaise,
  importEmployeesFromCsv,
} from '../src/services/employee.service';

let db: Database;

const DEFAULT_FILTERS = {
  search: '',
  department: '',
  country: '',
  minSalary: 0,
  maxSalary: Number.MAX_VALUE,
};

const BASE_EMPLOYEE = {
  first_name: 'Alice',
  last_name: 'Smith',
  email: 'alice@acme.com',
  job_title: 'Software Engineer',
  department: 'Engineering',
  salary: 100000,
  currency: 'USD',
  country: 'USA',
  date_of_joining: '2020-01-15',
  performance_rating: 4,
  gender: 'Female',
};

async function dbInsert(overrides: Record<string, unknown> = {}) {
  const emp = { ...BASE_EMPLOYEE, ...overrides };
  const employee_id = (overrides.employee_id as string) ?? `EMP-T${Date.now()}`;
  await db.run(
    `INSERT INTO employees
       (employee_id,first_name,last_name,email,job_title,department,salary,currency,country,date_of_joining,performance_rating,gender)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [employee_id, emp.first_name, emp.last_name, emp.email, emp.job_title,
     emp.department, emp.salary, emp.currency, emp.country,
     emp.date_of_joining, emp.performance_rating, emp.gender],
  );
  return db.get<Record<string, unknown>>('SELECT * FROM employees WHERE employee_id = ?', [employee_id]);
}

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(() => {
  teardownTestDb();
});

beforeEach(async () => {
  await db.run('DELETE FROM employees');
});

// ---------------------------------------------------------------------------
// listEmployees
// ---------------------------------------------------------------------------
describe('listEmployees', () => {
  it('returns empty result when table is empty', async () => {
    const result = await listEmployees(DEFAULT_FILTERS, 1, 10, 'id', 'ASC');
    expect(result.employees).toHaveLength(0);
    expect(result.pagination.totalCount).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
  });

  it('paginates results correctly', async () => {
    for (let i = 0; i < 15; i++) {
      await dbInsert({ email: `user${i}@acme.com`, employee_id: `EMP-${String(i).padStart(5, '0')}` });
    }
    const page1 = await listEmployees(DEFAULT_FILTERS, 1, 10, 'id', 'ASC');
    expect(page1.employees).toHaveLength(10);
    expect(page1.pagination.totalCount).toBe(15);
    expect(page1.pagination.totalPages).toBe(2);

    const page2 = await listEmployees(DEFAULT_FILTERS, 2, 10, 'id', 'ASC');
    expect(page2.employees).toHaveLength(5);
  });

  it('filters by department', async () => {
    await dbInsert({ department: 'Engineering', employee_id: 'EMP-00001', email: 'e1@acme.com' });
    await dbInsert({ department: 'Marketing', employee_id: 'EMP-00002', email: 'e2@acme.com' });
    await dbInsert({ department: 'Engineering', employee_id: 'EMP-00003', email: 'e3@acme.com' });

    const result = await listEmployees({ ...DEFAULT_FILTERS, department: 'Engineering' }, 1, 10, 'id', 'ASC');
    expect(result.employees).toHaveLength(2);
    expect(result.employees.every(e => e.department === 'Engineering')).toBe(true);
  });

  it('filters by country', async () => {
    await dbInsert({ country: 'USA', employee_id: 'EMP-00001', email: 'e1@acme.com' });
    await dbInsert({ country: 'Germany', currency: 'EUR', employee_id: 'EMP-00002', email: 'e2@acme.com' });

    const result = await listEmployees({ ...DEFAULT_FILTERS, country: 'USA' }, 1, 10, 'id', 'ASC');
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].country).toBe('USA');
  });

  it('filters by search term matching name', async () => {
    await dbInsert({ first_name: 'Alice', last_name: 'Smith', employee_id: 'EMP-00001', email: 'alice@acme.com' });
    await dbInsert({ first_name: 'Bob', last_name: 'Jones', employee_id: 'EMP-00002', email: 'bob@acme.com' });

    const result = await listEmployees({ ...DEFAULT_FILTERS, search: 'Alice' }, 1, 10, 'id', 'ASC');
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].first_name).toBe('Alice');
  });

  it('includes salary_usd with correct EUR conversion', async () => {
    await dbInsert({ salary: 100, currency: 'EUR', employee_id: 'EMP-00001', email: 'e@acme.com' });
    const result = await listEmployees(DEFAULT_FILTERS, 1, 10, 'id', 'ASC');
    // 100 EUR * 1.08 = 108 USD
    expect(result.employees[0].salary_usd).toBeCloseTo(108, 1);
  });

  it('sorts by salary descending', async () => {
    await dbInsert({ salary: 50000, employee_id: 'EMP-00001', email: 'e1@acme.com' });
    await dbInsert({ salary: 120000, employee_id: 'EMP-00002', email: 'e2@acme.com' });
    await dbInsert({ salary: 80000, employee_id: 'EMP-00003', email: 'e3@acme.com' });

    const result = await listEmployees(DEFAULT_FILTERS, 1, 10, 'salary', 'DESC');
    expect(result.employees[0].salary).toBe(120000);
    expect(result.employees[2].salary).toBe(50000);
  });
});

// ---------------------------------------------------------------------------
// getEmployeeById
// ---------------------------------------------------------------------------
describe('getEmployeeById', () => {
  it('returns the employee when found', async () => {
    const row = await dbInsert({ employee_id: 'EMP-00001', email: 'alice@acme.com' });
    const found = await getEmployeeById(String(row!.id));
    expect(found).toBeDefined();
    expect(found?.first_name).toBe('Alice');
    expect(found?.salary_usd).toBeDefined();
  });

  it('returns undefined when employee does not exist', async () => {
    const result = await getEmployeeById('99999');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createEmployee
// ---------------------------------------------------------------------------
describe('createEmployee', () => {
  it('creates an employee with an auto-generated employee_id', async () => {
    const result = await createEmployee(BASE_EMPLOYEE);
    expect(result.employee_id).toMatch(/^EMP-\d{5}$/);
    expect(result.first_name).toBe('Alice');
    expect(result.email).toBe('alice@acme.com');
  });

  it('increments employee_id for successive inserts', async () => {
    const first = await createEmployee({ ...BASE_EMPLOYEE, email: 'a@acme.com' });
    const second = await createEmployee({ ...BASE_EMPLOYEE, email: 'b@acme.com' });
    const firstNum = parseInt(first.employee_id.split('-')[1], 10);
    const secondNum = parseInt(second.employee_id.split('-')[1], 10);
    expect(secondNum).toBe(firstNum + 1);
  });
});

// ---------------------------------------------------------------------------
// updateEmployee
// ---------------------------------------------------------------------------
describe('updateEmployee', () => {
  it('updates employee fields', async () => {
    const emp = await createEmployee(BASE_EMPLOYEE);
    const updated = await updateEmployee(String(emp.id), { ...BASE_EMPLOYEE, first_name: 'Updated', email: 'upd@acme.com' });
    expect(updated?.first_name).toBe('Updated');
  });

  it('records previous salary when salary changes', async () => {
    const emp = await createEmployee({ ...BASE_EMPLOYEE, salary: 80000 });
    const updated = await updateEmployee(String(emp.id), { ...BASE_EMPLOYEE, salary: 90000 });
    expect(updated?.salary).toBe(90000);
    expect(updated?.previous_salary).toBe(80000);
  });

  it('does not overwrite previous_salary when salary is unchanged', async () => {
    const emp = await createEmployee({ ...BASE_EMPLOYEE, salary: 80000 });
    const updated = await updateEmployee(String(emp.id), { ...BASE_EMPLOYEE, salary: 80000 });
    expect(updated?.previous_salary).toBeNull();
  });

  it('returns undefined for a non-existent id', async () => {
    const result = await updateEmployee('99999', BASE_EMPLOYEE);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteEmployee
// ---------------------------------------------------------------------------
describe('deleteEmployee', () => {
  it('deletes the employee and returns true', async () => {
    const emp = await createEmployee(BASE_EMPLOYEE);
    const deleted = await deleteEmployee(String(emp.id));
    expect(deleted).toBe(true);
    expect(await getEmployeeById(String(emp.id))).toBeUndefined();
  });

  it('returns false when employee does not exist', async () => {
    expect(await deleteEmployee('99999')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyBulkRaise
// ---------------------------------------------------------------------------
describe('applyBulkRaise', () => {
  beforeEach(async () => {
    await dbInsert({ department: 'Engineering', salary: 100000, currency: 'USD', employee_id: 'EMP-00001', email: 'e1@acme.com' });
    await dbInsert({ department: 'Engineering', salary: 80000,  currency: 'USD', employee_id: 'EMP-00002', email: 'e2@acme.com' });
    await dbInsert({ department: 'Marketing',   salary: 70000,  currency: 'USD', employee_id: 'EMP-00003', email: 'e3@acme.com' });
  });

  it('previews a percentage raise without mutating the database', async () => {
    const result = await applyBulkRaise({ department: 'Engineering', raiseType: 'percentage', value: 10, isPreview: true });
    expect(result.isPreview).toBe(true);
    expect(result.affectedCount).toBe(2);
    expect(result.newTotalSpendUsd).toBeCloseTo(198000, 0);
    // Database must be unchanged
    const check = await db.get<{ salary: number }>('SELECT salary FROM employees WHERE employee_id = ?', ['EMP-00001']);
    expect(check?.salary).toBe(100000);
  });

  it('applies a flat raise to a department cohort', async () => {
    await applyBulkRaise({ department: 'Engineering', raiseType: 'flat', value: 5000, isPreview: false });
    const eng1 = await db.get<{ salary: number; previous_salary: number }>(
      'SELECT salary, previous_salary FROM employees WHERE employee_id = ?', ['EMP-00001'],
    );
    expect(eng1?.previous_salary).toBe(100000);
    expect(eng1?.salary).toBeGreaterThan(100000);
  });

  it('does not affect employees outside the target department', async () => {
    await applyBulkRaise({ department: 'Engineering', raiseType: 'percentage', value: 10, isPreview: false });
    const mkt = await db.get<{ salary: number }>('SELECT salary FROM employees WHERE employee_id = ?', ['EMP-00003']);
    expect(mkt?.salary).toBe(70000);
  });

  it('returns zero stats when no employees match the filter', async () => {
    const result = await applyBulkRaise({ department: 'NonExistentDept', raiseType: 'percentage', value: 10, isPreview: true });
    expect(result.affectedCount).toBe(0);
    expect(result.differenceUsd).toBe(0);
  });

  it('applies a raise to all employees when no filter is set', async () => {
    const result = await applyBulkRaise({ raiseType: 'flat', value: 1000, isPreview: false });
    expect(result.affectedCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// importEmployeesFromCsv
// ---------------------------------------------------------------------------
describe('importEmployeesFromCsv', () => {
  const HEADER = 'employee_id,first_name,last_name,email,job_title,department,salary,currency,country,date_of_joining,performance_rating,gender';
  const VALID_ROW = 'EMP-99001,John,Doe,john@test.com,Analyst,Finance,60000,USD,USA,2022-03-01,3,Male';

  it('imports valid CSV rows', async () => {
    const result = await importEmployeesFromCsv(`${HEADER}\n${VALID_ROW}`);
    expect(result.errors).toHaveLength(0);
    expect(result.insertedOrUpdated).toBe(1);
    const emp = await db.get<{ first_name: string }>('SELECT * FROM employees WHERE employee_id = ?', ['EMP-99001']);
    expect(emp?.first_name).toBe('John');
  });

  it('throws when CSV has fewer than 2 lines', async () => {
    await expect(importEmployeesFromCsv('just one line')).rejects.toThrow('CSV must contain a header row');
  });

  it('throws when required headers are missing', async () => {
    await expect(importEmployeesFromCsv('first_name,last_name\nAlice,Smith')).rejects.toThrow('CSV missing required headers');
  });

  it('reports error for non-numeric salary', async () => {
    const csv = `${HEADER}\nEMP-99002,John,Doe,j2@test.com,Analyst,Finance,NOTANUMBER,USD,USA,2022-03-01,3,Male`;
    const result = await importEmployeesFromCsv(csv);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Salary must be a positive number');
  });

  it('reports error for unsupported currency', async () => {
    const csv = `${HEADER}\nEMP-99003,John,Doe,j3@test.com,Analyst,Finance,60000,XYZ,USA,2022-03-01,3,Male`;
    const result = await importEmployeesFromCsv(csv);
    expect(result.errors[0]).toContain("Unsupported currency 'XYZ'");
  });

  it('reports error for malformed date', async () => {
    const csv = `${HEADER}\nEMP-99004,John,Doe,j4@test.com,Analyst,Finance,60000,USD,USA,01-03-2022,3,Male`;
    const result = await importEmployeesFromCsv(csv);
    expect(result.errors[0]).toContain('Invalid date_of_joining format');
  });

  it('updates existing employee when employee_id matches', async () => {
    await dbInsert({ employee_id: 'EMP-99005', email: 'orig@test.com', salary: 50000 });
    const csv = `${HEADER}\nEMP-99005,Updated,Name,updated@test.com,Analyst,Finance,65000,USD,USA,2022-03-01,4,Female`;
    const result = await importEmployeesFromCsv(csv);
    expect(result.insertedOrUpdated).toBe(1);
    const emp = await db.get<{ first_name: string; salary: number }>('SELECT * FROM employees WHERE employee_id = ?', ['EMP-99005']);
    expect(emp?.first_name).toBe('Updated');
    expect(emp?.salary).toBe(65000);
  });

  it('imports multiple rows in one batch', async () => {
    const rows = [
      'EMP-99010,Alice,A,a1@t.com,Dev,Engineering,80000,USD,USA,2021-01-01,4,Female',
      'EMP-99011,Bob,B,b1@t.com,Dev,Engineering,75000,USD,USA,2021-01-01,3,Male',
    ];
    const result = await importEmployeesFromCsv(`${HEADER}\n${rows.join('\n')}`);
    expect(result.insertedOrUpdated).toBe(2);
    expect(result.errors).toHaveLength(0);
  });
});
