import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DB_DIR, 'acme_payroll.db');

// Thin async wrapper that preserves the existing sqlite-package API surface
// so no changes are needed in service files or controllers.
class AsyncStatement {
  constructor(private stmt: ReturnType<DatabaseSync['prepare']>) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async run(...params: any[]): Promise<{ lastID?: number; changes?: number }> {
    const result = this.stmt.run(...params);
    return { lastID: Number(result.lastInsertRowid), changes: Number(result.changes) };
  }

  async finalize(): Promise<void> {
    // node:sqlite finalizes statements automatically — kept for API compatibility
  }
}

export class AsyncDatabase {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private db: any) {}

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async prepare(sql: string): Promise<AsyncStatement> {
    return new AsyncStatement(this.db.prepare(sql));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async get<T = any>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const stmt = this.db.prepare(sql);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = params && params.length > 0 ? stmt.get(...(params as any[])) : stmt.get();
    return row as T | undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async all<T = any[]>(sql: string, params?: unknown[]): Promise<T> {
    const stmt = this.db.prepare(sql);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = params && params.length > 0 ? stmt.all(...(params as any[])) : stmt.all();
    return rows as T;
  }

  async run(sql: string, params?: unknown[]): Promise<{ lastID?: number; changes?: number }> {
    // Transaction control statements cannot be prepared — execute directly
    const upper = sql.trim().toUpperCase().replace(/;$/, '').trim();
    if (upper === 'BEGIN TRANSACTION' || upper === 'BEGIN' || upper === 'COMMIT' || upper === 'ROLLBACK') {
      this.db.exec(sql);
      return {};
    }
    const stmt = this.db.prepare(sql);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = params && params.length > 0 ? stmt.run(...(params as any[])) : stmt.run();
    return { lastID: Number(result.lastInsertRowid), changes: Number(result.changes) };
  }
}

let dbInstance: AsyncDatabase | null = null;

/** Test-only: inject an in-memory database so service tests never touch the real file. */
export function setTestDb(db: AsyncDatabase): void {
  dbInstance = db;
}

/** Test-only: clear the singleton so the next getDb() reopens the real database. */
export function clearTestDb(): void {
  dbInstance = null;
}

export async function getDb(): Promise<AsyncDatabase> {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const rawDb = new DatabaseSync(DB_FILE);
  rawDb.exec('PRAGMA journal_mode = WAL;');

  dbInstance = new AsyncDatabase(rawDb);
  return dbInstance;
}

export async function initDb(): Promise<void> {
  const db = await getDb();

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

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
    CREATE INDEX IF NOT EXISTS idx_employees_country ON employees(country);
    CREATE INDEX IF NOT EXISTS idx_employees_job_title ON employees(job_title);
    CREATE INDEX IF NOT EXISTS idx_employees_names ON employees(first_name, last_name);
  `);

  console.log('Database initialized successfully with schemas and indexes.');
}
