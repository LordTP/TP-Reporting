"""
Teliporter Reporting Platform - Main FastAPI Application
"""
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import logging

from app.config import settings
from app.database import engine, Base

logger = logging.getLogger(__name__)
from app.api.v1 import auth, users, organizations, square, locations, sales, dashboards, reports, permissions, budgets, clients, exchange_rates, location_groups, footfall

# Rate limiter instance (shared with route-level decorators)
limiter = Limiter(key_func=get_remote_address, default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE}/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("Starting up Teliporter Reporting Platform...")
    yield
    # Shutdown
    logger.info("Shutting down...")


app = FastAPI(
    title="Teliporter Reporting Platform API",
    description="Multi-tenant reporting platform for Square sales data",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan
)

# Attach limiter to app state (required by slowapi)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Trusted Host Middleware — reject requests with spoofed Host headers
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(organizations.router, prefix="/api/v1/organizations", tags=["Organizations"])
app.include_router(square.router, prefix="/api/v1", tags=["Square Integration"])
app.include_router(locations.router, prefix="/api/v1/locations", tags=["Locations"])
app.include_router(sales.router, prefix="/api/v1/sales", tags=["Sales"])
app.include_router(dashboards.router, prefix="/api/v1/dashboards", tags=["Dashboards"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(permissions.router, prefix="/api/v1/permissions", tags=["Permissions"])
app.include_router(budgets.router, prefix="/api/v1/budgets", tags=["Budgets"])
app.include_router(clients.router, prefix="/api/v1", tags=["Clients"])
app.include_router(exchange_rates.router, prefix="/api/v1", tags=["Exchange Rates"])
app.include_router(location_groups.router, prefix="/api/v1", tags=["Location Groups"])
app.include_router(footfall.router, prefix="/api/v1/footfall", tags=["Footfall"])


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}
