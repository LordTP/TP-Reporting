# Teliporter Reporting Platform

A multi-tenant reporting platform for aggregating and analysing sales data from multiple Square accounts across different regions (US, UK, EU, AU). Features multi-currency support, budget management, client management, advanced analytics reports, and role-based access control.

## Architecture Overview

```
                          ┌─────────────┐
                          │   Frontend   │  React + TypeScript + Vite
                          │  :5173 dev   │  shadcn/ui + Tailwind + Recharts
                          └──────┬───────┘
                                 │
                          ┌──────▼───────┐
                          │   Backend    │  FastAPI + SQLAlchemy 2.0
                          │    :8000     │  JWT Auth + Pydantic v2
                          └──┬───────┬───┘
                             │       │
                    ┌────────▼──┐  ┌─▼──────────┐
                    │ PostgreSQL│  │   Redis     │
                    │   :5433   │  │   :6379     │
                    └───────────┘  └──┬──────────┘
                                     │
                              ┌──────▼───────┐
                              │ Celery Worker │  Background sync
                              │ Celery Beat   │  Scheduled tasks
                              └──────────────┘
```

## Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL 15 (port 5433)
- **ORM**: SQLAlchemy 2.0 with Alembic migrations
- **Task Queue**: Celery + Redis for background Square data sync
- **Authentication**: JWT (access + refresh tokens) with bcrypt password hashing
- **API Integration**: httpx for async Square API calls
- **Validation**: Pydantic v2 / pydantic-settings
- **Encryption**: Fernet (cryptography) for storing Square OAuth tokens

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v6
- **Server State**: TanStack Query (React Query)
- **Client State**: Zustand
- **UI Components**: shadcn/ui (Radix UI + Tailwind)
- **Styling**: TailwindCSS with dark/light theme support
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod
- **Excel Export**: SheetJS (xlsx)

### Infrastructure
- **Containerisation**: Docker + Docker Compose (5 services)
- **Target Deployment**: DigitalOcean Droplet (2 vCPU / 8 GB) + Managed PostgreSQL

---

## Features

### Multi-Account Square Integration
- OAuth connection flow from admin panel
- Multiple Square accounts per organisation (UK, US, EU, AU)
- Per-location sync selection
- Historical data import with date range picker
- Automatic ongoing sync via Celery Beat (every 15 minutes)
- Real-time sync status monitoring with progress indicators
- Catalog hierarchy sync (categories, items, variations)

### Multi-Currency Support
- All monetary amounts stored in smallest unit (pence/cents) as BIGINT
- Manual exchange rates managed by admins (exchange_rates table per organisation)
- Automatic GBP conversion for cross-currency aggregation
- Currency breakdown annotations on KPI cards showing per-currency totals
- Supports GBP, USD, EUR, AUD, and any additional currencies

### Authentication & Sessions
- JWT-based authentication with access tokens (15 min) and refresh tokens (60 min)
- Automatic token refresh via Axios interceptor on 401 responses
- Token storage in localStorage
- HS256 algorithm with configurable SECRET_KEY
- Users are automatically logged out after 60 minutes of inactivity

### Role-Based Access Control
- **Superadmin**: Full system access across all organisations
- **Admin**: Organisation-wide management, Square accounts, budgets, user management
- **Manager**: Assigned location access
- **Client**: Limited access to assigned locations/reports only
- Client-user linking via user_clients table

### Client Management
- Multi-client support per organisation
- Assign specific locations to clients
- Client-based filtering across all reports and analytics
- Client catalog keyword mapping for category-based filtering
- Client CRUD with location assignment

### Budget Management
- Budget targets per location per date (daily/weekly/monthly)
- CSV bulk upload for budgets
- Budget vs Actual performance reports with variance/attainment
- Status indicators: exceeded, on_track, below_target
- Amounts stored in cents with unique constraint per location/date/type

### Reports & Analytics (19 Report Types)
All reports support: date range presets, client filtering, location filtering, Excel export, and multi-currency aggregation.

| Report | Description |
|--------|-------------|
| Daily Sales Summary | Pre-aggregated daily totals with trend charts |
| Sales by Location | Breakdown by store with totals |
| Sales by Category | Category, product, and variant views with sorting |
| Sales by Product | Product-level sales with SKU drill-down |
| Sales by Payment Method | Cash, card, and other tender breakdowns |
| Hourly Sales Pattern | Hour-of-day heatmap/chart analysis |
| Budget vs Actual | Budget performance with attainment percentages |
| Tips Report | Tips by location, method, and daily trends |
| Discount Report | Discount usage and impact analysis |
| Tax Report | Tax collection breakdown |
| Refund Report | Refund tracking and analysis |
| Basket Analysis | Average basket size, items per order, order composition |

Reports with large datasets use client-side pagination (PAGE_SIZE = 100).

### Dashboards
- Dashboard creation and management
- Dashboard-location mapping
- User-dashboard permissions

---

## Project Structure

```
Reporting Platform/
├── backend/
│   ├── app/
│   │   ├── api/v1/                 # API route handlers (12 modules)
│   │   │   ├── auth.py             # Login, register, token refresh
│   │   │   ├── users.py            # User CRUD, role management
│   │   │   ├── organizations.py    # Organisation management
│   │   │   ├── square.py           # Square OAuth, sync triggers
│   │   │   ├── locations.py        # Location management, sync config
│   │   │   ├── sales.py            # Sales queries, analytics endpoints
│   │   │   ├── dashboards.py       # Dashboard CRUD
│   │   │   ├── clients.py          # Client CRUD, location assignment
│   │   │   ├── budgets.py          # Budget CRUD, performance reports
│   │   │   ├── exchange_rates.py   # Manual exchange rate CRUD
│   │   │   ├── permissions.py      # Permission management
│   │   │   └── reports.py          # Report-specific endpoints
│   │   ├── models/                 # SQLAlchemy models (13 models)
│   │   │   ├── user.py
│   │   │   ├── organization.py
│   │   │   ├── square_account.py
│   │   │   ├── location.py
│   │   │   ├── sales_transaction.py
│   │   │   ├── daily_sales_summary.py
│   │   │   ├── dashboard.py
│   │   │   ├── data_import.py
│   │   │   ├── client.py
│   │   │   ├── budget.py
│   │   │   ├── exchange_rate.py
│   │   │   ├── catalog_category.py
│   │   │   └── catalog_hierarchy.py
│   │   ├── schemas/                # Pydantic request/response schemas
│   │   │   ├── auth.py, user.py, sales.py, client.py
│   │   │   ├── budget.py, dashboard.py, square.py
│   │   │   └── exchange_rate.py
│   │   ├── services/               # Business logic layer
│   │   │   ├── auth_service.py
│   │   │   ├── square_service.py
│   │   │   ├── exchange_rate_service.py
│   │   │   ├── client_catalog_service.py
│   │   │   └── summary_service.py
│   │   ├── tasks/
│   │   │   └── sync_square_data.py  # Celery sync tasks
│   │   ├── utils/
│   │   │   └── security.py          # Password hashing, JWT creation
│   │   ├── middleware/              # Custom middleware
│   │   ├── main.py                 # FastAPI app + router registration
│   │   ├── config.py               # Settings via pydantic-settings
│   │   ├── database.py             # SQLAlchemy engine + session
│   │   └── dependencies.py         # Auth dependencies, DB session
│   ├── alembic/versions/           # 14 migration files
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/                  # 10 page components
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── DashboardPage.tsx       # Admin overview
│   │   │   ├── SalesPage.tsx           # Transaction list + filters
│   │   │   ├── AnalyticsPage.tsx       # KPIs + charts
│   │   │   ├── ReportsCatalogPage.tsx  # Report type grid
│   │   │   ├── ReportDetailPage.tsx    # Individual report view
│   │   │   ├── BudgetsPage.tsx         # Budget management
│   │   │   ├── SquareAccountsPage.tsx  # Square account admin
│   │   │   └── UsersPage.tsx           # User management
│   │   ├── features/
│   │   │   ├── auth/               # Login, register, protected routes
│   │   │   ├── square/             # Square OAuth, sync UI, history import
│   │   │   ├── budgets/            # Budget CSV upload
│   │   │   ├── clients/            # Client category keywords
│   │   │   └── reports/            # 19 report components
│   │   │       ├── ReportLayout.tsx            # Shared layout with filters
│   │   │       ├── useReportFilters.ts         # Shared filter hook
│   │   │       ├── exportToExcel.ts            # Excel export utility
│   │   │       ├── CurrencyBreakdown.tsx       # Multi-currency annotations
│   │   │       ├── DailySalesSummaryReport.tsx
│   │   │       ├── SalesByLocationReport.tsx
│   │   │       ├── SalesByCategoryReport.tsx   # Category/product/variant views
│   │   │       ├── SalesByProductReport.tsx     # Product + SKU views
│   │   │       ├── SalesByPaymentMethodReport.tsx
│   │   │       ├── HourlySalesPatternReport.tsx
│   │   │       ├── BudgetVsActualReport.tsx
│   │   │       ├── TipsReport.tsx
│   │   │       ├── DiscountReport.tsx
│   │   │       ├── TaxReport.tsx
│   │   │       ├── RefundReport.tsx
│   │   │       ├── BasketAnalysisReport.tsx
│   │   │       └── ComingSoonReport.tsx
│   │   ├── components/
│   │   │   ├── layout/AppNav.tsx   # Main navigation (role-aware)
│   │   │   ├── charts/             # KPICard, SalesLineChart, etc.
│   │   │   └── ui/                 # shadcn/ui components
│   │   ├── store/authStore.ts      # Zustand auth state
│   │   ├── lib/api-client.ts       # Axios with token refresh interceptor
│   │   ├── hooks/                  # Custom React hooks
│   │   ├── types/                  # TypeScript type definitions
│   │   └── App.tsx                 # Routes + layout
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
└── docker-compose.yml              # 5 services: postgres, redis, backend, celery worker, celery beat
```

---

## Database Schema (14 migrations applied)

| Table | Purpose |
|-------|---------|
| organizations | Top-level tenant entity |
| users | Users with roles (superadmin, admin, manager, client) |
| user_clients | Many-to-many user-client linking |
| square_accounts | Square OAuth connections per organisation |
| locations | Square locations with sync config and metadata |
| sales_transactions | Denormalised sales data (all currencies, amounts in cents) |
| daily_sales_summary | Pre-aggregated daily totals per location |
| data_imports | Historical import tracking |
| dashboards | Dashboard configurations |
| dashboard_locations | Dashboard-location mapping |
| user_dashboard_permissions | User access to dashboards |
| clients | Client entities per organisation |
| client_locations | Client-location mapping |
| budgets | Budget targets per location/date/type |
| exchange_rates | Manual exchange rates per organisation (from_currency → to_currency) |
| catalog_item_categories | Category assignments for catalog items |
| catalog_hierarchy | Category tree structure from Square catalog |

---

## API Endpoints

### Authentication
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/auth/login` | Login, returns access + refresh tokens |
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/refresh` | Refresh access token |

### Sales & Analytics
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/sales/transactions` | Paginated transaction list |
| GET | `/api/v1/sales/aggregation` | Total/avg/count KPIs |
| GET | `/api/v1/sales/daily` | Daily sales trend |
| GET | `/api/v1/sales/by-hour` | Hourly pattern analysis |
| GET | `/api/v1/sales/top-products` | Top products by revenue |
| GET | `/api/v1/sales/by-location` | Sales breakdown by location |
| GET | `/api/v1/sales/by-payment-method` | Payment method breakdown |
| GET | `/api/v1/sales/by-category` | Category/product/variant breakdown |
| GET | `/api/v1/sales/exchange-rates` | Current exchange rates |
| GET | `/api/v1/sales/analytics/tips-summary` | Tips analysis |
| GET | `/api/v1/sales/analytics/discounts-summary` | Discount analysis |
| GET | `/api/v1/sales/analytics/tax-summary` | Tax analysis |
| GET | `/api/v1/sales/analytics/refunds-summary` | Refund analysis |
| GET | `/api/v1/sales/analytics/basket-summary` | Basket analysis |
| GET | `/api/v1/sales/analytics/daily-summary` | Pre-aggregated daily summary |

### Budget Management
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/budgets` | Create budget |
| GET | `/api/v1/budgets` | List budgets (with filters) |
| GET | `/api/v1/budgets/{id}` | Get specific budget |
| PATCH | `/api/v1/budgets/{id}` | Update budget |
| DELETE | `/api/v1/budgets/{id}` | Delete budget |
| POST | `/api/v1/budgets/upload-csv` | Bulk CSV upload |
| GET | `/api/v1/budgets/performance/report` | Budget vs actual performance |

### Client Management
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/clients` | List clients |
| POST | `/api/v1/clients` | Create client |
| GET | `/api/v1/clients/{id}` | Get client |
| PUT | `/api/v1/clients/{id}` | Update client |
| DELETE | `/api/v1/clients/{id}` | Delete client |
| POST | `/api/v1/clients/{id}/locations` | Assign locations |

### Exchange Rates
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/exchange-rates` | List org exchange rates |
| POST | `/api/v1/exchange-rates` | Create rate (admin) |
| PUT | `/api/v1/exchange-rates/{id}` | Update rate (admin) |
| DELETE | `/api/v1/exchange-rates/{id}` | Delete rate (admin) |

### Square Integration
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/square/auth-url` | Get OAuth URL |
| GET | `/api/v1/square/callback` | OAuth callback |
| GET | `/api/v1/square/accounts` | List connected accounts |
| POST | `/api/v1/square/sync/{account_id}` | Trigger manual sync |
| POST | `/api/v1/square/historical-import` | Import historical data |

All sales/analytics endpoints support query params: `date_preset`, `start_date`, `end_date`, `client_id`, `location_ids`.

---

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Start All Services
```bash
docker-compose up -d
docker exec teliporter-backend alembic upgrade head
```

### Access Points
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs (Swagger)**: http://localhost:8000/docs
- **PostgreSQL**: localhost:5433 (user: teliporter, db: teliporter)
- **Redis**: localhost:6379

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

### Database Migrations
```bash
# Apply migrations
docker exec teliporter-backend alembic upgrade head

# Create new migration
docker exec teliporter-backend alembic revision --autogenerate -m "Description"

# Rollback
docker exec teliporter-backend alembic downgrade -1
```

---

## Frontend Routes

| Path | Page | Access |
|------|------|--------|
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/dashboard` | Admin Dashboard | Admin/Superadmin |
| `/sales` | Sales Transactions | All authenticated |
| `/analytics` | Analytics + KPIs | All authenticated |
| `/reports` | Reports Catalog | All authenticated |
| `/reports/:slug` | Individual Report | All authenticated |
| `/budgets` | Budget Management | Admin/Superadmin |
| `/square-accounts` | Square Accounts | Admin/Superadmin |

---

## Configuration

Key settings in `backend/app/config.py` (overridable via `.env`):

| Setting | Default | Purpose |
|---------|---------|---------|
| `DATABASE_URL` | `postgresql://teliporter:teliporter@localhost:5432/teliporter` | Database connection |
| `SECRET_KEY` | (change in production) | JWT signing key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 15 | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | 60 | Refresh token lifetime (auto-logout) |
| `SQUARE_APPLICATION_ID` | (required) | Square app credentials |
| `SQUARE_APPLICATION_SECRET` | (required) | Square app credentials |
| `SQUARE_ENVIRONMENT` | sandbox | `sandbox` or `production` |
| `ENCRYPTION_KEY` | (required) | Fernet key for Square token encryption |
| `CORS_ORIGINS` | localhost:3000, localhost:5173 | Allowed frontend origins |
| `DEFAULT_PAGE_SIZE` | 100 | API pagination default |
| `RATE_LIMIT_PER_MINUTE` | 100 | API rate limiting |

---

## Design Decisions

- **Amounts in cents/pence**: All monetary values stored as BIGINT in smallest currency unit to avoid floating-point errors
- **Denormalised sales_transactions**: Each row contains location name, currency, line items as JSON for fast reporting queries without joins
- **Manual exchange rates**: Admin-managed per organisation rather than external API, stored in exchange_rates table
- **Client-side pagination**: Report tables paginate at PAGE_SIZE=100 for performance; Excel exports always include full dataset
- **Pre-aggregated summaries**: daily_sales_summary table for fast daily reporting without scanning all transactions
- **Catalog hierarchy**: Synced from Square for category-based reporting and client keyword filtering

---

## Pending / Planned

- **Settings Page**: Admin UI for managing exchange rates (plan exists)
- **DigitalOcean Deployment**: Production setup on General Purpose droplet + Managed PostgreSQL
- **Dashboard Builder**: Drag-and-drop widget-based dashboard customisation
- **Additional Reports**: More report types via ComingSoonReport placeholder

---

**Last Updated**: January 31, 2026
