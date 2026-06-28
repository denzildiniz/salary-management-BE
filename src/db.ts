import fs from 'fs';
import path from 'path';
import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DB_DIR, 'acme_payroll.db');

let dbInstance: Database | null = null;

/** Test-only: inject an in-memory database so service tests never touch the real file. */
export function setTestDb(db: Database): void {
  dbInstance = db;
}

/** Test-only: clear the singleton so the next getDb() reopens the real database. */
export function clearTestDb(): void {
  dbInstance = null;
}

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  // Ensure database directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  // Open the SQLite database
  dbInstance = await open({
    filename: DB_FILE,
    driver: sqlite3.Database,
  });

  // Enable WAL mode for better concurrency and write speeds
  await dbInstance.exec('PRAGMA journal_mode = WAL;');

  return dbInstance;
}

export async function initDb(): Promise<void> {
  const db = await getDb();

  // Create employees table if it does not exist
  await db.exec(`
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
  `);

  // Create indexes for high-speed search and filtering
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
    CREATE INDEX IF NOT EXISTS idx_employees_country ON employees(country);
    CREATE INDEX IF NOT EXISTS idx_employees_job_title ON employees(job_title);
    CREATE INDEX IF NOT EXISTS idx_employees_names ON employees(first_name, last_name);
  `);

  console.log('Database initialized successfully with schemas and indexes.');
}
