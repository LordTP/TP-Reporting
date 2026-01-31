"""
Authentication API Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RefreshTokenRequest,
    RefreshTokenResponse,
    UserResponse
)
from app.services import auth_service
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.models.client import user_clients

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
async def login(
    credentials: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Login with email and password

    Returns access token, refresh token, and user info
    """
    user = auth_service.authenticate_user(db, credentials.email, credentials.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token, refresh_token = auth_service.create_user_tokens(user)

    # Load assigned client IDs for multi-client roles
    MULTI_CLIENT_ROLES = {"store_manager", "reporting", "manager"}
    assigned_client_ids = None
    role_val = user.role.value if isinstance(user.role, UserRole) else user.role
    if role_val in MULTI_CLIENT_ROLES:
        rows = db.query(user_clients.c.client_id).filter(user_clients.c.user_id == user.id).all()
        assigned_client_ids = [str(r[0]) for r in rows] if rows else []

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(
            id=str(user.id),
            email=user.email,
            full_name=user.full_name,
            role=user.role.value,
            organization_id=str(user.organization_id),
            client_id=str(user.client_id) if user.client_id else None,
            client_ids=assigned_client_ids,
            is_active=user.is_active
        )
    )


@router.post("/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    db: Session = Depends(get_db)
):
    """
    Register a new user and organization

    Creates a new organization and admin user
    """
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create organization
    organization = Organization(name=data.organization_name)
    db.add(organization)
    db.flush()

    # Create admin user for the organization
    user = auth_service.create_user(
        db=db,
        email=data.email,
        password=data.password,
        full_name=data.full_name,
        organization_id=str(organization.id),
        role=UserRole.ADMIN.value
    )

    # Generate tokens
    access_token, refresh_token = auth_service.create_user_tokens(user)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(
            id=str(user.id),
            email=user.email,
            full_name=user.full_name,
            role=user.role.value,
            organization_id=str(user.organization_id),
            client_id=str(user.client_id) if user.client_id else None,
            is_active=user.is_active
        )
    )


@router.post("/refresh", response_model=RefreshTokenResponse)
async def refresh_token(
    data: RefreshTokenRequest,
    db: Session = Depends(get_db)
):
    """
    Refresh access token using refresh token
    """
    new_access_token = auth_service.refresh_access_token(db, data.refresh_token)

    if not new_access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return RefreshTokenResponse(access_token=new_access_token)


@router.post("/logout")
async def logout():
    """
    Logout user

    Client should delete tokens from local storage
    """
    return {"message": "Successfully logged out"}
