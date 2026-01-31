"""
Location Group Schemas
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class LocationGroupCreate(BaseModel):
    name: str
    location_ids: List[str] = []


class LocationGroupUpdate(BaseModel):
    name: Optional[str] = None
    location_ids: Optional[List[str]] = None


class LocationGroupResponse(BaseModel):
    id: str
    name: str
    is_active: bool
    location_ids: List[str]
    location_names: List[str] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LocationGroupList(BaseModel):
    location_groups: List[LocationGroupResponse]
    total: int
