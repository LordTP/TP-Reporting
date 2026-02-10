# Teliporter Reporting Platform

Multi-tenant reporting platform for Square POS merchants. Syncs sales data from Square API, provides analytics dashboards, budget tracking, footfall logging, and exportable reports.

---

## ABSOLUTE RULES

1. **PRODUCTION ENVIRONMENT** — Developer works DIRECTLY ON PRODUCTION. No staging.
   - NEVER run Docker, server, database, or alembic commands without asking first.
   - NEVER suggest `docker compose down`, `docker compose restart`, `alembic downgrade`, or destructive operations.
   - NEVER interact with local Docker state. Developer SSHs into the server for commands.
   - Investigate production issues by reading CODE only.

2. **PRODUCTION DATABASE** — DigitalOcean Managed PostgreSQL (NOT a Docker container).
   - `postgresql://teliporter:<PASSWORD>@<DB_HOST>:25060/teliporter?sslmode=require`
   - Any SQL/migration command affects live data permanently. **The DB was previously wiped — NEVER AGAIN.**
   - `backend/.env` is LOCAL DEV ONLY. Production `.env` is at `/opt/teliporter/backend/.env`.

3. **DEPLOYMENT** — You only write code and push to `main`. Developer deploys on the server.
   - Quick backend redeploy: `cd /opt/teliporter && git pull origin main && docker compose -f docker-compose.prod.yml up -d --build backend celery_worker celery_beat --no-deps`
   - Full deploy: `cd /opt/teliporter && ./deploy.sh`
   - Always use `docker compose -f docker-compose.prod.yml` — never bare `docker compose`.
   - Always prefix commands with `cd /opt/teliporter &&` for copy-paste.

4. **MIGRATIONS** — Production: `cd /opt/teliporter && docker compose -f docker-compose.prod.yml exec backend alembic upgrade head`
   - Local: `cd backend && alembic revision --autogenerate -m "description"`

---

## Tech Stack

**Backend:** Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic, Celery + Redis, JWT (bcrypt), pydantic-settings
**Frontend:** React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, TanStack Query, Zustand, Recharts, React Hook Form + Zod
**Database:** PostgreSQL 15
**Infra:** DO Droplet (Ubuntu 22, 2 vCPU/8 GB), Nginx + Let's Encrypt, DO Managed Postgres. See `DEPLOYMENT.md`.

---

## Key Files & Structure

**Backend:** `backend/app/`
- `api/v1/` — 14 route files (auth, budgets, clients, dashboards, exchange_rates, footfall, location_groups, locations, organizations, permissions, reports, sales, square, users)
- `models/` — 16 SQLAlchemy models
- `services/` — square_service.py, summary_service.py, auth_service.py, exchange_rate_service.py, client_catalog_service.py
- `tasks/sync_square_data.py` — ALL Celery tasks: sync_square_payments, import_square_orders_task, sync_all_active_accounts, parse_and_store_order. (`import_historical_data` is DEAD CODE)
- `config/__init__.py` — Settings (pydantic-settings), `database.py`, `celery_app.py`, `dependencies.py`

**Frontend:** `frontend/src/`
- `features/` — auth, budgets, clients, footfall, permissions, reports (18 report components), square
- `lib/api-client.ts` — Axios + auto token refresh on 401
- `store/` — authStore.ts (Zustand), permissionStore.ts
- Location fetching: Admin → `/square/accounts/{id}/locations`, Other roles → `/clients/{id}/locations`

---

## Square Data Sync

All sync logic in `backend/app/tasks/sync_square_data.py`.

**Three data paths:**
1. **Auto sync (15 min):** Beat → `sync_all_active_accounts()` → `sync_square_payments.delay(account_id)` per account. No `import_id`.
2. **Manual sync:** `POST /api/v1/square/sync` → creates DataImport → `sync_square_payments.delay(account_id, location_ids, import_id)`.
3. **Historical import:** `POST /api/v1/square/import/historical` → creates DataImport → `import_square_orders_task.delay(import_id)`.

**sync_square_payments 3 passes:**
- Pass 1: New orders (closed since `last_sync_at`, or 7 days on first run)
- Pass 2: Updated orders (since `min(last_sync_at, now - 24h)`) — catches refunds
- Pass 3: Refunds API (last **7 days**) — re-fetches full order for each refund

**Duplicate detection** (`parse_and_store_order`): Checks `square_transaction_id` — updates if status/refunds changed, skips if unchanged, inserts if new, handles IntegrityError.

**Known gap:** 24h lookback means missed transactions older than 24h need historical import to recover.

---

## Data Models

All money in smallest currency unit (pence/cents) as BigInteger. Frontend divides by 100.

| Model | Key fields |
|-------|------------|
| `Organization` | name, settings |
| `User` | email, role (superadmin/admin/manager/viewer), organization_id |
| `SquareAccount` | OAuth tokens (Fernet encrypted), merchant_id, is_active, last_sync_at |
| `Location` | square_location_id, square_account_id, name, currency, timezone, is_active |
| `SalesTransaction` | square_transaction_id (unique), location_id, amounts, payment_status, line_items (JSONB), tender_type |
| `DailySalesSummary` | location_id + date (unique), totals, by_tender_type/by_hour/top_products (JSONB) |
| `Budget` | location_id, date, amount |
| `FootfallEntry` | location_id, date, count |
| `Client` | linked to locations via client_locations join table |
| `DataImport` | status (PENDING/IN_PROGRESS/COMPLETED/FAILED), imported_transactions |
| `RolePermission` | role, permission string |
| `Dashboard` | user_id, layout config |
| `ExchangeRate` | base_currency, target_currency, rate, date |
| `LocationGroup` | name, organization_id |
| `CatalogItemCategory` | catalog_object_id, item_name, category_name, artist_name |
| `CatalogCategory` | square_category_id, name, parent_category_id, is_top_level, path_to_root |

---

## Auth

JWT access tokens (15 min) + refresh tokens (7 days, stored in DB). Roles: superadmin, admin, manager, viewer. Frontend: `useAuthStore` (Zustand), `apiClient` (Axios) auto-refreshes on 401.

---

## Past Incidents

1. **DB wipe:** Destructive command wiped managed Postgres. All data lost. This is why the safety rules exist.
2. **ImportStatusEnum bug:** Manual sync crashed because wrong enum was imported. Auto-sync unaffected (skips import_id code path). Fixed.
3. **Sync lookback gap:** Regular sync only looks back 24h. Broken sync > 24h = permanently missed transactions without historical import.

---

## Timezone-Aware Reporting

All timestamps in `sales_transactions.transaction_date` are stored in UTC (from Square API). Reporting uses the `Location.timezone` field (e.g. `"Australia/Sydney"`, synced from Square) to convert to local time.

**How it works:**
- `backend/app/utils/timezone_helpers.py` — Centralized helpers:
  - `local_transaction_dt()` — SQLAlchemy expression using PostgreSQL `AT TIME ZONE` + `COALESCE(timezone, 'UTC')`. Requires JOIN to `locations` table.
  - `local_date_col()` / `local_hour_col()` — Extract local date/hour from transaction timestamp.
  - `utc_to_local()` — Python-side conversion using `zoneinfo.ZoneInfo`.
- `summary_service.py` — All 6 queries use `AT TIME ZONE` via Location JOIN. `DailySalesSummary.date` stores **location-local dates**.
- `sales.py` — All SQL queries use `local_transaction_dt()` for date/hour grouping. All Python-side loops use `utc_to_local()` with a `loc_tz_map` dict. Date presets ("today", "this_week" etc.) resolve in the location's timezone via `_tz_for_locations()` helper (returns timezone when all filtered locations share one, else falls back to UTC).
- NULL timezone locations fall back to UTC. DST handled by PostgreSQL's IANA timezone DB.

**After code changes:** Must rebuild DailySalesSummary via `POST /api/v1/sales/summary/rebuild` to re-aggregate with correct local dates. The 15-min Celery sync automatically uses the fixed code for future data.

---

## Known Technical Debt

1. **Dead code: `import_historical_data` task** — never called. Has monthly chunking that `import_square_orders_task` lacks.
2. **No chunking in historical imports** — `import_square_orders_task` fetches entire date range in one loop. May hit 170-min soft time limit.
3. **`asyncio.run()` in Celery tasks** — called per paginated page. Works but inefficient.
4. **No concurrency guard** — nothing prevents duplicate imports for same account.
