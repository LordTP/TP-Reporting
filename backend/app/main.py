"""
Teliporter Reporting Platform - Main FastAPI Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database import engine, Base
from app.api.v1 import auth, users, organizations, square, locations, sales, dashboards, reports, permissions, budgets, clients, exchange_rates, location_groups, footfall


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    print("Starting up Teliporter Reporting Platform...")
    yield
    # Shutdown
    print("Shutting down...")


app = FastAPI(
    title="Teliporter Reporting Platform API",
    description="Multi-tenant reporting platform for Square sales data",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Teliporter Reporting Platform API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}
