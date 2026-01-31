"""
Dashboard Schemas
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, field_serializer
from uuid import UUID


class DashboardBase(BaseModel):
    """Base dashboard schema"""
    name: str
    description: Optional[str] = None
    config: Dict[str, Any] = {}


class DashboardCreate(DashboardBase):
    """Create dashboard"""
    location_ids: Optional[List[str]] = None  # Location IDs to associate with dashboard


class DashboardUpdate(BaseModel):
    """Update dashboard"""
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    location_ids: Optional[List[str]] = None


class DashboardResponse(DashboardBase):
    """Dashboard response"""
    id: str
    organization_id: str
    created_by: str
    is_template: bool
    created_at: datetime
    updated_at: datetime
    location_ids: List[str] = []

    @field_serializer('id', 'organization_id', 'created_by')
    def serialize_uuid(self, value):
        """Convert UUID to string"""
        if isinstance(value, UUID):
            return str(value)
        return value

    class Config:
        from_attributes = True


class DashboardList(BaseModel):
    """List of dashboards"""
    dashboards: List[DashboardResponse]
    total: int


class DashboardLocationCreate(BaseModel):
    """Add location to dashboard"""
    location_id: str


class UserDashboardPermissionCreate(BaseModel):
    """Grant user access to dashboard"""
    user_id: str
