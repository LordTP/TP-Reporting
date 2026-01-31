"""
Square API Schemas
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, field_serializer
from uuid import UUID


# OAuth Schemas
class SquareOAuthURL(BaseModel):
    """OAuth authorization URL response"""
    url: str


class SquareOAuthCallback(BaseModel):
    """OAuth callback parameters"""
    code: str
    state: str


# Square Account Schemas
class SquareAccountBase(BaseModel):
    """Base Square account schema"""
    account_name: str
    base_currency: str


class SquareAccountCreate(SquareAccountBase):
    """Create Square account"""
    pass


class SquareAccountResponse(SquareAccountBase):
    """Square account response"""
    id: str
    organization_id: str
    square_merchant_id: str
    is_active: bool
    last_sync_at: Optional[datetime] = None
    created_at: datetime

    @field_serializer('id', 'organization_id')
    def serialize_uuid(self, value):
        """Convert UUID to string"""
        if isinstance(value, UUID):
            return str(value)
        return value

    class Config:
        from_attributes = True


class SquareAccountList(BaseModel):
    """List of Square accounts"""
    accounts: List[SquareAccountResponse]
    total: int


# Location Schemas
class LocationBase(BaseModel):
    """Base location schema"""
    name: str
    currency: str
    timezone: Optional[str] = None


class LocationResponse(LocationBase):
    """Location response"""
    id: str
    square_account_id: str
    square_location_id: str
    address: Optional[Dict[str, Any]] = None
    is_active: bool
    location_metadata: Optional[Dict[str, Any]] = None

    @field_serializer('id', 'square_account_id')
    def serialize_uuid(self, value):
        """Convert UUID to string"""
        if isinstance(value, UUID):
            return str(value)
        return value

    class Config:
        from_attributes = True


class LocationList(BaseModel):
    """List of locations"""
    locations: List[LocationResponse]
    total: int


class LocationUpdate(BaseModel):
    """Update location (toggle active status)"""
    is_active: bool


# Historical Import Schemas
class HistoricalImportRequest(BaseModel):
    """Request to import historical data"""
    square_account_id: str
    location_ids: Optional[List[str]] = None  # None means all locations
    start_date: datetime
    end_date: datetime


class ImportStatus(BaseModel):
    """Import status response"""
    id: str
    square_account_id: str
    location_id: Optional[str] = None
    import_type: str
    start_date: datetime
    end_date: datetime
    status: str
    total_transactions: int
    imported_transactions: int
    duplicate_transactions: int
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    @field_serializer('id', 'square_account_id', 'location_id')
    def serialize_uuid(self, value):
        """Convert UUID to string"""
        if isinstance(value, UUID):
            return str(value)
        return value

    class Config:
        from_attributes = True


class ImportStatusList(BaseModel):
    """List of import statuses"""
    imports: List[ImportStatus]
    total: int


# Sync Schemas
class SyncRequest(BaseModel):
    """Request to sync Square data"""
    square_account_id: str
    location_ids: Optional[List[str]] = None  # None means all active locations


class SyncResponse(BaseModel):
    """Sync response"""
    message: str
    task_id: Optional[str] = None
    locations_synced: int


class SyncStatusResponse(BaseModel):
    """Sync status for a Square account"""
    square_account_id: str
    account_name: str
    last_sync_at: Optional[datetime] = None
    active_locations: int
    total_locations: int
    recent_imports: List[ImportStatus] = []
