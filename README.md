# ACME Salary Management — Backend

REST API for the ACME CompManager payroll and compensation analytics platform. Built with Node.js, Express, TypeScript, and SQLite.

## Tech Stack

- **Node.js** with **TypeScript**
- **Express** — HTTP server and routing
- **SQLite** via `sqlite` + `sqlite3` — embedded database
- **Helmet** — HTTP security headers
- **express-rate-limit** — request rate limiting
- **dotenv** — environment variable loading
- **Vitest** — unit and integration tests

## API Endpoints

### Employees

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/employees` | Paginated, filtered, sorted employee list |
| `GET` | `/api/employees/:id` | Single employee by ID |
| `POST` | `/api/employees` | Create a new employee |
| `PUT` | `/api/employees/:id` | Update an employee |
| `DELETE` | `/api/employees/:id` | Delete an employee |
| `GET` | `/api/employees/export` | Export all employees as CSV |
| `POST` | `/api/employees/import` | Bulk import employees from CSV |
| `POST` | `/api/employees/bulk-raise` | Apply or preview bulk salary adjustments |

### Analytics & Query

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics` | KPIs, department spend, country averages, salary bands, gender pay gap |
| `GET` | `/api/query?q=` | Natural language query engine |

### Query Parameters — `GET /api/employees`

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page, max 100 (default: 10) |
| `search` | string | Full-text search on name, email, job title, employee ID |
| `department` | string | Filter by department |
| `country` | string | Filter by country |
| `minSalary` | number | Minimum salary in USD |
| `maxSalary` | number | Maximum salary in USD |
| `sortBy` | string | Column to sort by (default: `id`) |
| `sortOrder` | `ASC` \| `DESC` | Sort direction (default: `ASC`) |

## Getting Started

```bash
# Install dependencies
npm install

# Copy env file and configure
cp .env.example .env

# Seed the database with 10,000 sample employees
npm run seed

# Start the development server
npm run dev
```

Server runs on `http://localhost:3001` by default.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Port the server listens on |
| `NODE_ENV` | `development` | Environment mode |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin for CORS |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot reload via `tsx watch` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm run seed` | Seed database with 10,000 sample employee records |
| `npm test` | Run all tests with Vitest |

## Project Structure

```
src/
├── controllers/        # Request handlers
│   ├── employee.controller.ts
│   └── analytics.controller.ts
├── services/           # Business logic and DB queries
│   ├── employee.service.ts
│   └── analytics.service.ts
├── routes/             # Express route definitions
│   ├── index.ts
│   ├── employee.routes.ts
│   ├── analytics.routes.ts
│   └── query.routes.ts
├── middleware/
│   └── errorHandler.ts # Global error handler
├── utils/
│   └── asyncHandler.ts # Async route wrapper
├── constants/
│   └── sql.ts          # Shared SQL fragments (USD conversion)
├── scripts/
│   └── seed.ts         # Database seeder
├── app.ts              # Express app factory
├── db.ts               # SQLite connection and schema init
├── config.ts           # Exchange rates and currency helpers
├── queryEngine.ts      # Natural language query parser
└── index.ts            # Entry point
```

## Supported Currencies

USD, EUR (€), GBP (£), CAD, INR (₹), JPY (¥) — all salaries are stored in local currency and converted to USD on the fly using fixed exchange rates defined in `src/config.ts`.

## Rate Limiting

- General routes: **500 requests / 15 minutes** per IP
- `/api/employees/import` and `/api/employees/bulk-raise`: **100 requests / 15 minutes** per IP
