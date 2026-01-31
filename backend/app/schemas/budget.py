"""
Budget Schemas
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from enum import Enum


class BudgetType(str, Enum):
    """Budget type enumeration"""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class BudgetBase(BaseModel):
    """Base budget schema"""
    location_id: str
    date: date
    budget_amount: int = Field(..., description="Budget amount in cents")
    currency: str = Field(..., max_length=3, description="Currency code (e.g., GBP, USD)")
    budget_type: BudgetType = BudgetType.DAILY
    notes: Optional[str] = None


class BudgetCreate(BudgetBase):
    """Budget creation schema"""
    pass


class BudgetUpdate(BaseModel):
    """Budget update schema"""
    budget_amount: Optional[int] = Field(None, description="Budget amount in cents")
    budget_type: Optional[BudgetType] = None
    notes: Optional[str] = None


class BudgetResponse(BudgetBase):
    """Budget response schema"""
    id: str
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BudgetListResponse(BaseModel):
    """Budget list response schema"""
    budgets: list[BudgetResponse]
    total: int


class BudgetPerformance(BaseModel):
    """Budget performance metrics"""
    location_id: str
    location_name: str
    date: date
    budget_amount: int
    actual_sales: int
    variance: int  # actual - budget
    variance_percentage: float  # (variance / budget) * 100
    attainment_percentage: float  # (actual / budget) * 100
    currency: str
    status: str  # 'on_track' (>=90%), 'below_target' (<90%), 'exceeded' (>100%)


class BudgetPerformanceReport(BaseModel):
    """Budget performance report response"""
    performances: list[BudgetPerformance]
    summary: dict  # Contains aggregated metrics


class BudgetUploadResponse(BaseModel):
    """Response from CSV budget upload"""
    message: str
    rows_processed: int
    budgets_created: int
    budgets_updated: int
    unmatched_locations: list[str]
