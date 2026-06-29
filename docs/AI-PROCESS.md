# AI-Assisted Development — Process & Prompts

This document describes how Claude (via Claude Code CLI) was used to build the ACME Salary Management backend. The goal is to be transparent about the AI tooling used and the human judgment exercised at each stage.

---

## Tool Used

**Claude Code** (Anthropic) — an agentic AI CLI that can read and write files, run shell commands, and reason about a codebase end-to-end.

---

## Development Phases

### Phase 1 — Requirements & Planning

**Human decision:** Defined the problem scope — replace Excel-based HR workflows for 10,000 employees with a web application. Explicitly decided what to leave out (auth, real-time FX rates, full audit logs, LLM query engine) and documented reasoning.

**Prompt used (paraphrased):**
> "I need to build employee salary management software for 10,000 employees. The user is an HR Manager. Help me write a one-page requirements document covering goal, scope, features, and deliberate omissions before we touch any code."

**Human review:** Reviewed the generated requirements document and added the trade-off rationale for leaving out LLM-based NLP in favour of a deterministic rule-based engine.

---

### Phase 2 — Backend Scaffold

**Prompt used (paraphrased):**
> "Set up a Node.js + Express + TypeScript backend with SQLite. I need: employee CRUD routes, analytics aggregation endpoint, a natural language query endpoint, CSV import/export, and a seed script for 10,000 realistic employees across 6 countries in 6 currencies."

**Human decisions made:**
- Chose WAL mode for SQLite (better concurrent read performance)
- Decided to store salary in local currency and convert to USD inline via SQL CASE rather than storing a redundant `salary_usd` column
- Chose `employee_id` as the upsert key for CSV import rather than email (more stable identifier)
- Decided on layered architecture: Routes → Controllers → Services → DB, with controllers kept thin (HTTP only, no business logic)

---

### Phase 3 — NLP Query Engine

**Prompt used (paraphrased):**
> "Implement a rule-based natural language query engine in queryEngine.ts. Support these intents: total payroll spend, average salary, highest-paid employees, headcount, gender pay gap. Each intent should filter by department or country if mentioned. Return structured data with intent, answer text, data payload, and a visualization type hint."

**Human decision:** Deliberately kept this rule-based and not LLM-backed. Reasoning documented in `docs/DECISIONS.md` #5.

---

### Phase 4 — Security Hardening

**Prompt used (paraphrased):**
> "Add Helmet for HTTP security headers, express-rate-limit (500 req/15 min general, 100 req/15 min for write endpoints), and lock CORS to the CORS_ORIGIN environment variable instead of wildcard."

**Human decisions made:**
- Set rate limits at 500 (read) / 100 (write) per 15 minutes — sensible for a single-HR-user tool
- Applied the stricter mutation limiter only to `/import` and `/bulk-raise`, not all POST/PUT/DELETE endpoints

---

### Phase 5 — Unit Testing

**Prompt used (paraphrased):**
> "Write Vitest unit tests for: currency conversion helpers, employee service (CRUD, pagination, filtering, bulk raise, CSV import), analytics service (aggregations, salary bands, gender pay gap), and the NLP query engine. Use an in-memory SQLite database for service tests. The db.ts module already has setTestDb / clearTestDb hooks for this."

**Human review:** Checked that each test exercised a real behaviour rather than just re-asserting the implementation. Verified 48 tests all pass with `npm test`.

**Test coverage:**

| File | Tests | What it covers |
|---|---|---|
| `tests/config.test.ts` | 8 | `toUSD()` for all 6 currencies + edge cases |
| `tests/queryEngine.test.ts` | 12 | All 5 intents, department/country filters, unknown intent |
| `tests/employee.service.test.ts` | 18 | Create, read, paginate, filter, bulk raise, CSV import/upsert |
| `tests/analytics.service.test.ts` | 10 | Payroll total, avg salary, headcount, gender pay gap, salary bands |
| **Total** | **48** | |

---

### Phase 6 — Deployment & Production Fixes

**Prompt used (paraphrased):**
> "I'm deploying to Render. The backend crashes with GLIBC_2.38 not found. How do I fix this permanently?"

**Issues encountered and resolved:**

| Issue | Root cause | Fix |
|---|---|---|
| `GLIBC_2.38 not found` on Render | `sqlite3` native addon compiled on build machine (GLIBC 2.38) can't run on runtime machine (GLIBC 2.31) | Migrated to `node:sqlite` — built into Node 22+, zero native addon |
| TypeScript build errors after migration | `node:sqlite` types `lastInsertRowid` as `number \| bigint`; generic defaults were too strict | Added `Number()` cast; changed `AsyncDatabase` defaults to `any` |
| No data after each deploy | Render free tier wipes SQLite file on redeploy | Added `runSeed()` call in `index.ts` with a `COUNT(*)` empty-check guard |
| CORS blocked from Vercel | `CORS_ORIGIN` env var pointed to `localhost:5173` in Render | Updated to Vercel production URL (`salary-management-app-five.vercel.app`) |
| CORS error persisted after env update | Render does not auto-redeploy on env var change | Triggered a manual redeploy from Render dashboard |

**Human decisions made:**
- Chose to migrate to `node:sqlite` rather than pay for Render persistent disk or switch to a hosted database — eliminates the native addon problem entirely
- Chose auto-seed on startup over a seed endpoint (security) or deploy hook (not supported on free tier)

---

## What AI Did vs. What I Decided

| AI Generated | Human Decided |
|---|---|
| Boilerplate route, controller, service structure | Which intents the NLP engine supports |
| SQL queries and index definitions | Store salary in local currency (not USD) |
| asyncHandler utility and errorHandler middleware | Thin controllers — no business logic in HTTP layer |
| Test scaffolding, in-memory DB setup, assertion patterns | Rate limit numbers appropriate for single-user tool |
| Seed script data distributions and ranges | Upsert key = `employee_id`, not email |
| CSV parsing and validation logic | Row-level validation errors collected, not abort-on-first |
| `AsyncDatabase` wrapper after node:sqlite migration | Migrate to node:sqlite rather than pay for persistent disk |
| Deployment config and env var wiring | Auto-seed on startup rather than manual seed endpoint |

The AI accelerated implementation speed significantly. All architectural decisions, scope calls, and code reviews were performed by the developer.
