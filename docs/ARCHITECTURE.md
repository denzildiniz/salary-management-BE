# Backend Architecture Overview

## System Diagram

```
                        HTTPS / JSON
  React SPA (Vercel) ──────────────────► Express API (Render :3001)
                        CORS: CORS_ORIGIN
                        env var

┌─────────────────────────────────────────────────────────┐
│           Express + TypeScript — Render (free tier)     │
│                                                         │
│  Middleware pipeline (app.ts)                           │
│  ├─ Helmet      → security headers                      │
│  ├─ CORS        → CORS_ORIGIN env var (not wildcard)    │
│  ├─ Rate limit  → 500 req/15 min general                │
│  │               100 req/15 min on /import & /bulk-raise│
│  ├─ JSON body   → 10 MB limit                           │
│  └─ CSV body    → text/csv, 10 MB limit                 │
│                                                         │
│  Routes  /api/…                                         │
│  ├─ /employees          → employee.routes.ts            │
│  │   GET    /           list + filter + paginate        │
│  │   POST   /           create employee                 │
│  │   GET    /:id        single employee                 │
│  │   PUT    /:id        update employee                 │
│  │   DELETE /:id        delete employee                 │
│  │   GET    /export     CSV download                    │
│  │   POST   /import     CSV upload (upsert)             │
│  │   POST   /bulk-raise % raise across filter           │
│  ├─ /analytics          → analytics.routes.ts           │
│  │   GET    /           all aggregations                │
│  └─ /query              → query.routes.ts               │
│      POST   /           natural language query          │
│                                                         │
│  Services (business logic)                              │
│  ├─ employee.service.ts  CRUD, pagination, bulk raise   │
│  ├─ analytics.service.ts aggregations, gender pay gap   │
│  └─ queryEngine.ts       rule-based NLP intent parser   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │   SQLite (node:sqlite — built into Node 22+)     │   │
│  │   WAL mode · acme_payroll.db                     │   │
│  │   employees table · 4 indexes                    │   │
│  │   (department, country, job_title, name search)  │   │
│  │   Auto-seeded on startup if empty (10 000 rows)  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  Global error handler (middleware/errorHandler.ts)      │
│  └─ Catches thrown errors, returns JSON { error, … }   │
└─────────────────────────────────────────────────────────┘
```

---

## Request Lifecycle

```
Incoming request
  → Helmet (adds security headers)
  → CORS check (blocks origins not matching CORS_ORIGIN)
  → Rate limiter (general or mutation limit depending on route)
  → JSON / CSV body parser
  → Router → Controller (thin HTTP handler)
                → Service (business logic + SQL)
                    → AsyncDatabase (node:sqlite wrapper)
  ← JSON response
  ← Global errorHandler (if service throws)
```

---

## Key Technical Decisions

### node:sqlite (built-in) over sqlite3 npm package

Node.js 22 ships `node:sqlite` as a built-in module. It needs no native addon compilation, which eliminates the GLIBC version mismatch that caused `ERR_DLOPEN_FAILED` on Render's free tier (build machine runs GLIBC 2.38; runtime machine runs Ubuntu 20.04 / GLIBC 2.31). A thin `AsyncDatabase` wrapper class exposes the same async `get()` / `all()` / `run()` / `exec()` / `prepare()` API that service files already used.

### Singleton database instance with test injection

`db.ts` keeps a module-level `AsyncDatabase` singleton. All request handlers share one connection, which is correct for SQLite single-writer semantics. Tests inject an in-memory database via `setTestDb()` / `clearTestDb()` — the real `node:sqlite` driver runs against `:memory:` so tests execute actual SQL without touching the file on disk.

### Currency normalisation in SQL

Exchange rates are hardcoded in `config.ts` (USD, EUR, GBP, CAD, INR, JPY) and duplicated as a SQL `CASE currency WHEN … THEN rate END` expression in `constants/sql.ts`. All salary aggregations multiply `salary * rate` inside the SQLite query engine, keeping the result set small and eliminating a JavaScript aggregation pass over 10,000 rows.

### Rule-based NLP query engine

`queryEngine.ts` uses substring matching and a fixed entity list (department names, country names) to classify user queries into one of five intents: `TOTAL_PAYROLL`, `AVERAGE_SALARY`, `TOP_EARNERS`, `HEADCOUNT`, `GENDER_PAY_GAP`. No LLM call, no external API dependency, fully deterministic — same query always returns the same intent and SQL.

### asyncHandler wrapper

All route callbacks are wrapped in `asyncHandler()` (a one-liner that wraps `async` functions and calls `next(err)` on rejection). This avoids duplicating `try/catch` in every controller and ensures all unhandled promise rejections reach the global `errorHandler` middleware.

### Auto-seed on startup

`index.ts` calls `runSeed()` immediately after `initDb()`. `runSeed()` queries `COUNT(*)` first — if rows exist it returns immediately (no-op). This handles Render's free-tier ephemeral filesystem: SQLite is wiped on every redeploy, and the seed re-populates 10,000 records automatically on the next cold start (~5 s overhead).

---

## Data Model

```
employees
  id                 INTEGER  PK AUTOINCREMENT
  employee_id        TEXT     UNIQUE  e.g. EMP-00042
  first_name         TEXT
  last_name          TEXT
  email              TEXT
  job_title          TEXT
  department         TEXT     indexed
  salary             REAL     stored in local currency
  currency           TEXT     USD | EUR | GBP | CAD | INR | JPY
  country            TEXT     indexed
  date_of_joining    TEXT     YYYY-MM-DD
  performance_rating INTEGER  1–5
  gender             TEXT
  previous_salary    REAL     NULL if no change recorded

Indexes
  idx_department       → fast department GROUP BY / filter
  idx_country          → fast country GROUP BY / filter
  idx_job_title        → fast job title filter
  idx_name_search      → first_name + last_name for LIKE search
```

---

## API Reference

### Employees — `GET /api/employees`

Query params:
| Param | Type | Description |
|---|---|---|
| `page` | number | 1-based page number (default 1) |
| `limit` | number | rows per page (default 50) |
| `search` | string | full-name LIKE filter |
| `department` | string | exact match |
| `country` | string | exact match |
| `minSalary` | number | USD equivalent lower bound |
| `maxSalary` | number | USD equivalent upper bound |
| `sortBy` | string | field name |
| `sortOrder` | `asc\|desc` | sort direction |

Response: `{ employees: Employee[], total: number, page: number, limit: number }`

### Employees — `POST /api/employees/bulk-raise`

Body: `{ percentage: number, department?: string, country?: string, performanceRating?: number }`

Applies a salary raise to all employees matching the optional filter combination. Returns count of affected rows and average salary before/after.

### Employees — `POST /api/employees/import`

Body: CSV text (`Content-Type: text/csv`)

Validates each row, then upserts on `employee_id`. Returns `{ inserted, updated, errors[] }`.

### Analytics — `GET /api/analytics`

Returns a single JSON object with:
- `totalPayrollUSD` — sum of all salaries in USD
- `averageSalaryUSD` — mean salary in USD
- `headcount` — total employee count
- `byDepartment` — array of `{ department, headcount, avgSalaryUSD }`
- `byCountry` — array of `{ country, headcount, totalPayrollUSD }`
- `genderPayGap` — `{ male: avgUSD, female: avgUSD, gap: % }`
- `salaryBands` — histogram of USD salary ranges

### Query — `POST /api/query`

Body: `{ query: string }`

Parses free-text query into one of five intents and executes the corresponding SQL. Returns `{ intent, answer, data, visualizationType }`.

---

## File Structure

```
backend/                          ← this repository
├── docs/
│   ├── ARCHITECTURE.md   ← this file
│   ├── DECISIONS.md
│   └── AI-PROCESS.md
├── src/
│   ├── index.ts              entry point — initDb → runSeed → listen
│   ├── app.ts                Express factory — middleware + routes
│   ├── db.ts                 node:sqlite AsyncDatabase singleton
│   ├── config.ts             exchange rates + USD converter function
│   ├── queryEngine.ts        rule-based NLP intent classifier + SQL runner
│   ├── constants/
│   │   └── sql.ts            reusable USD CASE SQL fragment
│   ├── controllers/
│   │   ├── employee.controller.ts   thin HTTP handlers for employee routes
│   │   └── analytics.controller.ts  thin HTTP handler for analytics route
│   ├── middleware/
│   │   └── errorHandler.ts   global error → JSON response mapping
│   ├── routes/
│   │   ├── index.ts          mounts /employees, /analytics, /query
│   │   ├── employee.routes.ts
│   │   ├── analytics.routes.ts
│   │   └── query.routes.ts
│   ├── scripts/
│   │   └── seed.ts           deterministic 10 000-record seeder
│   ├── services/
│   │   ├── employee.service.ts   CRUD, pagination, bulk raise, CSV import
│   │   └── analytics.service.ts  aggregations, salary bands, gender pay gap
│   ├── types/
│   │   └── index.ts          shared TypeScript interfaces (Employee, etc.)
│   └── utils/
│       └── asyncHandler.ts   wraps async route handlers, forwards errors to next()
├── tests/
│   ├── config.test.ts              currency conversion unit tests
│   ├── queryEngine.test.ts         NLP intent parsing unit tests
│   ├── employee.service.test.ts    CRUD + pagination + bulk raise + CSV import
│   ├── analytics.service.test.ts   aggregations + salary bands + gender pay gap
│   └── helpers/
│       └── testDb.ts               creates in-memory node:sqlite DB, calls setTestDb
├── data/
│   └── acme_payroll.db      SQLite file (gitignored — auto-created on startup)
├── .env.example             documents required environment variables
├── .gitignore
└── README.md
```
