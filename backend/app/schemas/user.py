"""
User Schemas
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


class UserBase(BaseModel):
    """Base user schema"""
    email: EmailStr
    full_name: str


class UserCreate(UserBase):
    """User creation schema"""
    password: str = Field(..., min_length=8)
    role: str = "client"
    client_id: Optional[str] = None
    client_ids: Optional[List[str]] = None
    location_ids: Optional[List[str]] = None


class UserUpdate(BaseModel):
    """User update schema"""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    client_id: Optional[str] = None
    client_ids: Optional[List[str]] = None
    location_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    """User response schema"""
    id: str
    email: str
    full_name: str
    role: str
    organization_id: str
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    client_ids: Optional[List[str]] = None
    client_names: Optional[List[str]] = None
    location_ids: Optional[List[str]] = None
    location_names: Optional[List[str]] = None
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """List of users response"""
    users: List[UserResponse]
    total: int


class ChangePasswordRequest(BaseModel):
    """Change password request schema"""
    current_password: str
    new_password: str = Field(..., min_length=8)
