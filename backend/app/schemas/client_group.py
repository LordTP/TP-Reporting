"""
Client Group Schemas
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class ClientGroupCreate(BaseModel):
    name: str
    client_ids: List[str] = []


class ClientGroupUpdate(BaseModel):
    name: Optional[str] = None
    client_ids: Optional[List[str]] = None


class ClientGroupResponse(BaseModel):
    id: str
    name: str
    is_active: bool
    client_ids: List[str]
    client_names: List[str] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ClientGroupList(BaseModel):
    client_groups: List[ClientGroupResponse]
    total: int
