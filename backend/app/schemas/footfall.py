"""
Footfall Schemas
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


class FootfallCreate(BaseModel):
    location_id: str
    date: date
    count: int = Field(..., ge=0, description="Footfall visitor count")


class FootfallUpdate(BaseModel):
    count: int = Field(..., ge=0, description="Updated footfall count")


class FootfallResponse(BaseModel):
    id: str
    organization_id: str
    location_id: str
    date: date
    count: int
    created_by: str
    updated_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    location_name: Optional[str] = None
    creator_name: Optional[str] = None

    class Config:
        from_attributes = True


class FootfallListResponse(BaseModel):
    entries: List[FootfallResponse]
    total: int
    page: int
    page_size: int
