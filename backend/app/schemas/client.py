"""
Client Schemas
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID


class ClientBase(BaseModel):
    """Base client schema"""
    name: str
    email: Optional[str] = None
    is_active: bool = True
    category_keywords: Optional[List[str]] = None


class ClientCreate(ClientBase):
    """Schema for creating a client"""
    pass


class ClientUpdate(BaseModel):
    """Schema for updating a client"""
    name: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    category_keywords: Optional[List[str]] = None


class ClientResponse(ClientBase):
    """Client response schema"""
    id: str
    organization_id: str
    created_at: datetime
    updated_at: datetime
    location_count: int = 0
    category_keywords: Optional[List[str]] = None

    class Config:
        from_attributes = True


class ClientLocationAssignment(BaseModel):
    """Schema for assigning locations to a client"""
    location_ids: List[str]


class ClientList(BaseModel):
    """List of clients with pagination"""
    clients: List[ClientResponse]
    total: int
