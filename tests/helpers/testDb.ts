import { DatabaseSync } from 'node:sqlite';
import { AsyncDatabase, setTestDb, clearTestDb } from '../../src/db';

export async function createTestDb(): Promise<AsyncDatabase> {
  const rawDb = new DatabaseSync(':memory:');

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      job_title TEXT NOT NULL,
      department TEXT NOT NULL,
      salary REAL NOT NULL,
      currency TEXT NOT NULL,
      country TEXT NOT NULL,
      date_of_joining TEXT NOT NULL,
      performance_rating INTEGER NOT NULL,
      gender TEXT NOT NULL,
      previous_salary REAL DEFAULT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
    CREATE INDEX IF NOT EXISTS idx_employees_country ON employees(country);
    CREATE INDEX IF NOT EXISTS idx_employees_job_title ON employees(job_title);
    CREATE INDEX IF NOT EXISTS idx_employees_names ON employees(first_name, last_name);
  `);

  const db = new AsyncDatabase(rawDb);
  setTestDb(db);
  return db;
}

export function teardownTestDb(): void {
  clearTestDb();
}
