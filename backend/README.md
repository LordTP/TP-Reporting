# Teliporter Reporting Platform - Backend

FastAPI-based backend for the Teliporter multi-tenant reporting platform.

## Features

- Multi-account Square API integration
- Multi-currency support (USD, GBP, EUR, AUD)
- Role-based access control (RBAC)
- Budget management with CSV upload
- Real-time data synchronization with Celery
- JWT authentication
- PostgreSQL database with Alembic migrations

## Tech Stack

- **Framework**: FastAPI 0.109.0
- **Database**: PostgreSQL 15+
- **ORM**: SQLAlchemy 2.0
- **Migrations**: Alembic
- **Task Queue**: Celery + Redis
- **Authentication**: JWT with bcrypt

## Quick Start

### Prerequisites

- Python 3.11+
- Docker and Docker Compose
- PostgreSQL 15+ (if running without Docker)

### Setup with Docker (Recommended)

1. Copy environment variables:
```bash
cp .env.example .env
```

2. Start all services:
```bash
docker-compose up -d
```

3. Run migrations:
```bash
docker-compose exec backend alembic upgrade head
```

4. API will be available at `http://localhost:8000`
5. API docs at `http://localhost:8000/docs`

### Local Development Setup

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start PostgreSQL and Redis (via Docker or locally)

5. Run migrations:
```bash
alembic upgrade head
```

6. Start the development server:
```bash
uvicorn app.main:app --reload
```

## Database Migrations

Create a new migration:
```bash
alembic revision --autogenerate -m "Description of changes"
```

Apply migrations:
```bash
alembic upgrade head
```

Rollback last migration:
```bash
alembic downgrade -1
```

## Testing

Run all tests:
```bash
pytest
```

Run with coverage:
```bash
pytest --cov=app --cov-report=html
```

## Project Structure

```
backend/
├── app/
│   ├── api/v1/          # API route handlers
│   ├── models/          # SQLAlchemy models
│   ├── schemas/         # Pydantic schemas
│   ├── services/        # Business logic
│   ├── tasks/           # Celery tasks
│   ├── utils/           # Utility functions
│   ├── middleware/      # Custom middleware
│   ├── main.py          # FastAPI app
│   ├── config.py        # Configuration
│   ├── database.py      # Database connection
│   └── dependencies.py  # Common dependencies
├── alembic/             # Database migrations
├── tests/               # Test files
├── requirements.txt     # Python dependencies
└── Dockerfile          # Docker configuration
```

## Environment Variables

See `.env.example` for all required environment variables.

Key variables:
- `DATABASE_URL`: PostgreSQL connection string
- `SECRET_KEY`: JWT secret key
- `SQUARE_APPLICATION_ID`: Square app ID
- `SQUARE_APPLICATION_SECRET`: Square app secret
- `ENCRYPTION_KEY`: Key for encrypting Square tokens

## API Documentation

Interactive API documentation is available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Celery Tasks

Start Celery worker:
```bash
celery -A app.tasks worker --loglevel=info
```

Start Celery beat (scheduler):
```bash
celery -A app.tasks beat --loglevel=info
```

## License

Proprietary - All rights reserved
