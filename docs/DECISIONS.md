# Engineering Decisions & Trade-offs

## 1. SQLite over PostgreSQL / MySQL

**Decision:** Use SQLite with WAL mode as the relational database.

**Rationale:**
- Zero setup: no server process, credentials, or network configuration. The database is a single file (`data/acme_payroll.db`).
- WAL mode enables concurrent reads alongside a writer, which is adequate for a single-instance web server.
- SQLite handles 10,000-row datasets trivially; all analytics queries complete in under 10 ms.

**Trade-off accepted:**
- SQLite is not suitable for multi-writer, multi-instance deployments. Migrating to PostgreSQL later requires changing the driver and connection string — the SQL itself is compatible.

---

## 2. node:sqlite over the sqlite3 native addon

**Decision:** Use Node.js's built-in `node:sqlite` module (stable since Node 22) instead of the `sqlite3` npm package.

**Rationale:**
- `sqlite3` ships prebuilt native binaries compiled against a specific GLIBC version. Render's build machine (Ubuntu 22.04, GLIBC 2.38) produces a binary that crashes on the runtime machine (Ubuntu 20.04, GLIBC 2.31) with `ERR_DLOPEN_FAILED: /lib/x86_64-linux-gnu/libc.so.6: version GLIBC_2.38 not found`.
- Compiling from source (`sqlite3_build_from_source=true`) doesn't work on Render's free tier because build and runtime are separate containers — the compiled binary is not transferred.
- `node:sqlite` is compiled directly into the Node.js binary. Zero native addon, zero GLIBC dependency, zero build step.
- A thin `AsyncDatabase` wrapper class exposes an async `get()` / `all()` / `run()` / `exec()` / `prepare()` API over `DatabaseSync`, so no service files needed changing.

**Trade-off accepted:**
- `node:sqlite` was experimental in Node 22; it stabilised in Node 24. The API is stable but newer and less documented than the `sqlite3` / `better-sqlite3` ecosystem. The `DatabaseSync` API is synchronous — the async wrapper adds one micro-task tick of overhead per call, which is negligible.

---

## 3. Fixed exchange rates

**Decision:** Exchange rates are hardcoded in `config.ts` and duplicated as a SQL CASE expression in `constants/sql.ts`.

**Rationale:**
- Eliminates external API dependency (no outage risk, no API key management).
- Makes analytics fully deterministic, which simplifies testing.
- Exchange rates for the assessment dataset change slowly enough that hardcoded values don't affect the utility of the analytics.

**Trade-off accepted:**
- Rates drift over time. A real production system would pull rates daily from an open exchange-rate API and cache them. This is a known V2 item.

---

## 4. Currency normalisation in SQL (not in JavaScript)

**Decision:** Salary-to-USD conversion is embedded as a `CASE currency WHEN … THEN rate END * salary` expression directly in SQL queries.

**Rationale:**
- Pushes arithmetic into SQLite's query engine, keeping the JavaScript result set small.
- Avoids iterating 10,000 rows in Node.js just to multiply by a rate — the database returns pre-aggregated USD totals.
- A single `constants/sql.ts` fragment is shared across all analytics queries, so rate changes require updating one file.

**Trade-off accepted:**
- The SQL fragment is duplicated between `config.ts` (for JS helpers) and `constants/sql.ts` (for SQL). Updating exchange rates must be done in both places. A real system would use a stored USD column or a live rates API.

---

## 5. Rule-based NLP over an LLM

**Decision:** `queryEngine.ts` uses substring matching and a fixed entity list (department names, country names) to classify queries into five intents.

**Rationale:**
- No external API cost or latency.
- Fully deterministic — the same query always returns the same intent, making unit tests straightforward.
- The assessment only requires answering a bounded set of compensation questions.

**Trade-off accepted:**
- The engine cannot handle paraphrases or typos outside its pattern set. An LLM-backed engine (e.g., Claude with tool use) would cover arbitrary phrasing, but adds cost, API key management, and non-determinism.

---

## 6. Singleton database instance with test injection

**Decision:** `db.ts` keeps a module-level `AsyncDatabase` singleton. Tests inject an in-memory database via `setTestDb()` / `clearTestDb()`.

**Rationale:**
- A single SQLite connection avoids WAL contention and is idiomatic for a single-process Node.js server.
- Exporting `setTestDb` / `clearTestDb` gives full test isolation without mocking the entire db module — the real `node:sqlite` driver runs against `:memory:`, so tests execute actual SQL against an in-memory database with no disk I/O.

**Trade-off accepted:**
- The singleton means the database file is opened on startup and stays open. For a multi-tenant deployment this would need a connection pool, but for a single-tenant HR tool it is correct and efficient.

---

## 7. asyncHandler wrapper for all routes

**Decision:** Every async route callback is wrapped in `asyncHandler()` — a three-line utility that calls `next(err)` on promise rejection.

**Rationale:**
- Without this, an `async` route that throws will hang the request (Express 4 does not catch unhandled promise rejections from route handlers automatically).
- The alternative — wrapping every controller body in `try/catch` — is boilerplate repeated across every endpoint.
- `asyncHandler` reduces each controller to its happy path; error propagation is handled once in the global `errorHandler` middleware.

**Trade-off accepted:**
- Express 5 (currently in release candidate) handles async rejections natively, making `asyncHandler` unnecessary. This wrapper is a short-term compatibility shim.

---

## 8. CSV import as upsert (not append-only)

**Decision:** If an imported CSV row's `employee_id` matches an existing record, the record is updated (upsert). Otherwise it is inserted.

**Rationale:**
- HR teams often export, correct, and re-import the same data. Upsert prevents duplicate records and allows corrections without deleting first.
- The operation is wrapped in a transaction so a mid-import failure rolls back all changes.
- Row-level validation errors are collected and returned in the response rather than aborting on the first error — the caller can see all problems at once.

**Trade-off accepted:**
- A row without an `employee_id` always results in a new insert, even if the email already exists. Full deduplication by email would require an extra look-up per row. Documented as known behaviour in the API response.

---

## 9. Auto-seed on startup (not a one-time migration command)

**Decision:** `index.ts` calls `runSeed()` after `initDb()` on every server start. `runSeed()` checks `COUNT(*)` and returns immediately if data exists.

**Rationale:**
- Render's free tier provides no persistent disk — the SQLite file is wiped on every new deploy.
- Running `npm run seed` as a post-deploy command is not supported on Render's free web service tier.
- A seed API endpoint would be a security risk without authentication.
- The `COUNT(*)` guard makes the check a single fast query (~0.1 ms) on warm starts — negligible overhead.

**Trade-off accepted:**
- Seeding 10,000 records adds approximately 5 seconds to the first cold start after each deploy. Acceptable for a demo; a production system would use a persistent database (PostgreSQL on Render, Supabase, or PlanetScale) and run seed as a one-time migration.

---

## 10. Vitest for backend unit testing

**Decision:** Use Vitest as the test framework with an in-memory SQLite database injected via `setTestDb()`.

**Rationale:**
- Vitest uses the same ESM module resolution as the project's `"type": "module"` TypeScript configuration — no additional transform setup needed.
- Faster cold start than Jest for small suites.
- API is Jest-compatible, so switching is low-friction if needed.
- In-memory SQLite means tests run entirely in-process with no network or file I/O — the full test suite (48 tests) completes in under 2 seconds.

**Trade-off accepted:**
- Vitest is newer and less widely documented than Jest, which can be a friction point for contributors unfamiliar with the ecosystem.

**Test coverage:**

| File | Tests | What it covers |
|---|---|---|
| `tests/config.test.ts` | 8 | `toUSD()` for all 6 currencies + edge cases |
| `tests/queryEngine.test.ts` | 12 | All 5 intents, department/country filters, unknown intent |
| `tests/employee.service.test.ts` | 18 | Create, read, paginate, filter, bulk raise, CSV import/upsert |
| `tests/analytics.service.test.ts` | 10 | Payroll total, avg salary, headcount, gender pay gap, salary bands |
| **Total** | **48** | |

---

## 11. Render (backend) deployment

**Decision:** Deploy the Express API to Render's free tier web service.

**Rationale:**
- Render provides a Node.js runtime with automatic HTTPS, environment variable management, and deploy-on-push from GitHub — zero server administration.
- The free tier is sufficient for a demo with a single concurrent user.
- `CORS_ORIGIN` and `PORT` are configured as Render environment variables, keeping secrets out of source code.

**Trade-off accepted:**
- Render's free tier spins down after 15 minutes of inactivity. The first request after idle takes 30–60 seconds (cold start, including re-seeding 10,000 rows). A paid Render instance or Railway would eliminate this. For the assessment, the cold-start behaviour is disclosed in the README.
