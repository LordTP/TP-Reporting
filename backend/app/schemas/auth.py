"""
Authentication Schemas
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List


class LoginRequest(BaseModel):
    """Login request schema"""
    email: EmailStr
    password: str = Field(..., min_length=8)


class LoginResponse(BaseModel):
    """Login response schema"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class RegisterRequest(BaseModel):
    """Registration request schema"""
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=2, max_length=100)
    organization_name: str = Field(..., min_length=2, max_length=100)


class RefreshTokenRequest(BaseModel):
    """Refresh token request schema"""
    refresh_token: str


class RefreshTokenResponse(BaseModel):
    """Refresh token response schema"""
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """User response schema"""
    id: str
    email: str
    full_name: str
    role: str
    organization_id: str
    client_id: Optional[str] = None
    client_ids: Optional[List[str]] = None
    is_active: bool

    class Config:
        from_attributes = True


class TokenPayload(BaseModel):
    """Token payload schema"""
    sub: str
    email: str
    role: str
    org_id: str
    client_id: Optional[str] = None
    exp: int
    type: str


# Update forward reference
LoginResponse.model_rebuild()
