# Teliporter Reporting Platform

Multi-tenant reporting platform for Square POS merchants. Syncs sales data from Square API, provides analytics dashboards, budget tracking, footfall logging, and exportable reports.

---

## ABSOLUTE RULES — READ THESE FIRST

### 1. PRODUCTION ENVIRONMENT — DO NOT TOUCH WITHOUT ASKING
- The developer works DIRECTLY ON PRODUCTION. There is no staging environment.
- **NEVER run Docker commands, server commands, database commands, or ANY command that interacts with running services** without first confirming with the developer what environment they are on.
- **NEVER suggest `docker compose down`, `docker compose restart`, `alembic downgrade`, or any destructive operation** without explicit instruction from the developer.
- **NEVER look at or interact with the local machine's Docker state.** The developer SSHs into the production server to run commands there. You only edit code files locally and push via git.
- If the developer reports a production issue, investigate by reading the CODE only. Do not run Docker/server commands yourself.

### 2. PRODUCTION DATABASE IS MANAGED POSTGRES ON DIGITALOCEAN
- Production PostgreSQL is a **DigitalOcean Managed Database** — it is NOT a Docker container.
- Connection: `postgresql://teliporter:<PASSWORD>@<DB_HOST>:25060/teliporter?sslmode=require`
- Any SQL/migration/alembic command that runs against it **affects live production data permanently**.
- The production database was previously wiped by a destructive command. This MUST NEVER happen again.
- The `.env` file in this repo (`backend/.env`) is for LOCAL DEVELOPMENT ONLY. Production has its own `.env` at `/opt/teliporter/backend/.env` on the server with a completely different `DATABASE_URL`.
- DO managed Postgres has daily automatic backups with 7-day retention.

### 3. HOW DEPLOYMENT WORKS
- Developer edits code locally, commits and pushes to `main` branch.
- Developer SSHs into the production server and runs deploy commands there.
- **You never deploy. You only write code and push.**
- Quick backend-only redeploy (developer runs on server): `git pull origin main && docker compose -f docker-compose.prod.yml up -d --build backend celery_worker celery_beat --no-deps`
- Full deploy (developer runs on server): `./deploy.sh`
- The `--no-deps` flag is critical — it prevents recreating redis/other containers.

### 4. WHEN SUGGESTING FIXES
- Write the code fix, commit, and push. Then tell the developer what commands to run on the server.
- Always specify `docker compose -f docker-compose.prod.yml` (not just `docker compose`) — production uses the prod compose file.
- Be explicit about which file and which compose file. Never assume.
- **ALWAYS give the full exact command including `cd /opt/teliporter &&`** so it can be copy-pasted directly. The developer may not be in the project directory. Never give partial commands.

---

## Production Infrastructure

See `DEPLOYMENT.md` for the complete deployment guide.

```
Internet
  |
Nginx (SSL via Let's Encrypt, serves frontend static files)
  |
DO Droplet (Ubuntu 22, 2 vCPU / 8 GB) at /opt/teliporter/
  |-- Backend container (FastAPI, uvicorn, 4 workers, port 127.0.0.1:8000)
  |-- Celery Worker container (4 concurrency)
  |-- Celery Beat container (15-min sync schedule)
  |-- Redis container (127.0.0.1:6379, task broker only)
  |-- Frontend: static files at /opt/teliporter/frontend/dist (served by Nginx, NOT a container)
  |
DO Managed PostgreSQL (separate service, port 25060, SSL required, daily backups)
```

**Two compose files:**
- `docker-compose.prod.yml` — Production. NO postgres container. Services use `env_file: ./backend/.env`. Ports bound to 127.0.0.1 (behind Nginx). `restart: always`.
- `docker-compose.yml` — Local dev only. HAS a postgres container on port 5433. Volume mounts for hot reload. `restart: unless-stopped`.

---

## Tech Stack

**Backend:** Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic, Celery + Redis, JWT auth (bcrypt), pydantic-settings
**Frontend:** React 18, TypeScript, Vite, TailwindCSS, shadcn/ui (Radix UI), TanStack Query, Zustand, Recharts, React Hook Form + Zod
**Database:** PostgreSQL 15

---

## Project Structure

```
backend/
  app/
    api/v1/           — 14 route files:
                        auth.py, budgets.py, clients.py, dashboards.py,
                        exchange_rates.py, footfall.py, location_groups.py,
                        locations.py, organizations.py, permissions.py,
                        reports.py, sales.py, square.py, users.py
    models/           — 17 SQLAlchemy models (see Data Models section)
    schemas/          — Pydantic request/response schemas
    services/         — Business logic (square_service.py is the main one)
    tasks/
      sync_square_data.py  — THE critical file. Contains ALL Celery tasks:
                             sync_square_payments, import_historical_data,
                             import_square_orders_task, sync_all_active_accounts,
                             parse_and_store_order (shared duplicate detection)
    utils/            — Encryption (Fernet for Square tokens), helpers
    config/__init__.py — Settings class (pydantic-settings, reads from .env)
    database.py       — DB engine + SessionLocal
    celery_app.py     — Celery config + beat schedule
    main.py           — FastAPI app with middleware, CORS, router includes
    dependencies.py   — get_db, get_current_user, role checkers
  alembic/            — 17 migration files in alembic/versions/
  Dockerfile          — Python 3.11-slim, non-root appuser
  requirements.txt

frontend/
  src/
    components/
      ui/             — shadcn/ui base components
      layout/         — Sidebar, Header, AppLayout
      charts/         — KPICard.tsx, SalesChart.tsx, etc.
      common/         — DataTable, DatePicker, etc.
    features/
      auth/           — LoginForm, RegisterForm, ProtectedRoute, useAuth
      budgets/        — BudgetUpload.tsx (CSV upload with validation + "All Locations" template),
                        BudgetOverview.tsx
      clients/        — ClientCategoryKeywords.tsx
      footfall/       — FootfallEntry.tsx (main page), FootfallCalendar.tsx,
                        FootfallDialog.tsx, FootfallTable.tsx
      permissions/    — RolePermissionMatrix.tsx
      reports/        — 18 report components + exportToExcel.ts + useReportFilters.ts
                        (SalesByLocation, SalesByProduct, SalesByCategory,
                         SalesByPaymentMethod, HourlySalesPattern, BudgetVsActual,
                         FootfallMetrics, Refund, Discount, Tax, Tips,
                         BasketAnalysis, CurrencyBreakdown, DailySalesSummary, etc.)
      square/         — SquareAccountManager.tsx, LocationManager.tsx,
                        HistoricalImport.tsx, SyncStatusDashboard.tsx, squareApi.ts
    pages/            — Page-level components
    hooks/            — Custom React hooks
    store/            — authStore.ts (Zustand), permissionStore.ts
    lib/
      api-client.ts   — Axios instance with auth interceptors + auto token refresh
      utils.ts        — cn() helper for tailwind class merging
    config/           — App configuration
```

---

## Square Data Sync — How It Works (IMPORTANT)

This is the most complex and bug-prone part of the system. All logic lives in `backend/app/tasks/sync_square_data.py`.

### Three ways data comes in:

1. **Automatic sync (every 15 min):** Celery Beat calls `sync_all_active_accounts()` which iterates all active Square accounts and dispatches `sync_square_payments.delay(account_id)` for each. Does NOT pass `import_id`, so the DataImport status tracking code is skipped.

2. **Manual sync (user clicks "Sync" button):** Frontend calls `POST /api/v1/square/sync`. Backend creates a `DataImport` record and calls `sync_square_payments.delay(account_id, location_ids, import_id)`. Because `import_id` is passed, the task updates the DataImport record on completion/failure.

3. **Historical import:** Frontend calls `POST /api/v1/square/import` with a date range. Uses `import_historical_data` or `import_square_orders_task` Celery tasks. Used for backfilling data.

### sync_square_payments has 3 passes:

- **Pass 1 — New orders:** Fetches orders closed since `last_sync_at` (or last 7 days on first run).
- **Pass 2 — Updated orders:** Fetches orders updated since `min(last_sync_at, now - 24h)`. Catches refunds on older orders.
- **Pass 3 — Refunds API:** Checks the Square Refunds API for the last 24 hours. Re-fetches the full order for any refund found.

### Duplicate detection (parse_and_store_order):

All sync paths call `parse_and_store_order()` which checks for existing records by `square_transaction_id`:
- **If found + status/refunds changed:** Updates the existing record, returns `(True, True)`
- **If found + no changes:** Skips, returns `(False, True)` — counted as duplicate
- **If not found:** Inserts new record, returns `(True, False)`
- **IntegrityError:** Rolls back, returns `(False, True)` — treated as duplicate

### Known gap:
The 24-hour lookback window means transactions older than 24 hours that were never synced (e.g. because sync was broken) will NOT be picked up by the regular sync. They need a historical import to be recovered.

### After sync completes:
The task calls the daily summary rebuild endpoint to update `DailySalesSummary` for affected dates.

---

## Data Models (key ones)

| Model | Table | Key fields |
|-------|-------|------------|
| `SquareAccount` | `square_accounts` | OAuth tokens (Fernet encrypted), merchant_id, is_active, last_sync_at |
| `Location` | `locations` | square_location_id, square_account_id, name, currency, is_active |
| `SalesTransaction` | `sales_transactions` | square_transaction_id (unique), location_id, amount_money_amount, total_money_amount, payment_status, line_items (JSONB), tender_type, closed_at |
| `DailySalesSummary` | `daily_sales_summary` | location_id + date (unique), total_sales, total_gross, transaction_count, total_items, by_tender_type (JSONB), by_hour (JSONB), top_products (JSONB) |
| `Budget` | `budgets` | location_id, date, amount (BigInteger, pence/cents) |
| `FootfallEntry` | `footfall_entries` | location_id, date, count |
| `Client` | `clients` | Multi-tenant entities, linked to locations via client_locations |
| `DataImport` | `data_imports` | status (PENDING/IN_PROGRESS/COMPLETED/FAILED), imported_transactions, error_message |
| `User` | `users` | email, role (superadmin/admin/manager/viewer), organization_id |
| `RolePermission` | `role_permissions` | role, permission string |

**All money amounts are stored in smallest currency unit (pence/cents) as BigInteger.** Frontend divides by 100 for display.

---

## Authentication

- JWT access tokens (15 min expiry) + refresh tokens (7 days expiry, stored in DB)
- Roles: `superadmin`, `admin`, `manager`, `viewer`
- Permission system: `role_permissions` table maps roles to permission strings
- Frontend: `useAuthStore` (Zustand) for auth state, `apiClient` (Axios) auto-refreshes expired tokens
- Config: `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS` in Settings

---

## Common Patterns

- **API client:** `frontend/src/lib/api-client.ts` — Axios with interceptors for Bearer token, auto-refresh on 401
- **Location fetching:** Admin/superadmin → `/square/accounts` then `/square/accounts/{id}/locations`. Other roles → `/clients` then `/clients/{id}/locations`
- **Feature structure:** Each feature in `frontend/src/features/` is self-contained
- **Query invalidation:** TanStack Query with keys like `['footfall-entries', locationFilter, monthKey]`. Mutations invalidate related query keys.
- **CORS:** Configured in `backend/app/config/__init__.py` Settings class

---

## Database Migrations

Production migrations must be run inside the backend container on the server:
```bash
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

Creating a new migration (locally):
```bash
cd backend && alembic revision --autogenerate -m "description"
```

---

## Git & Workflow

- Single `main` branch, no feature branches currently
- All code edits happen locally, push to main
- Developer deploys on the production server manually
- No CI/CD pipeline

---

## Past Incidents & Lessons

1. **Production database wipe:** A destructive command wiped the managed PostgreSQL database. All live data was lost. This is why the safety rules above exist.
2. **Manual sync crash (ImportStatusEnum bug):** `sync_square_payments` referenced `ImportStatusEnum.COMPLETED` and `ImportStatusEnum.FAILED` but only `ImportStatus` was imported. Auto-sync worked because it doesn't pass `import_id` (skips the status update code). Manual sync always passes `import_id`, so it crashed. Fixed by changing `ImportStatusEnum` to `ImportStatus`.
3. **Missing REFRESH_TOKEN_EXPIRE_DAYS:** The Settings class didn't have this field, causing a startup crash. Fixed by adding `REFRESH_TOKEN_EXPIRE_DAYS: int = 7` to the Settings class.
4. **Sync lookback gap:** Regular sync only looks back 24 hours. If sync is broken for longer than 24 hours, transactions from that period are permanently missed by auto-sync and need a historical import to recover.
