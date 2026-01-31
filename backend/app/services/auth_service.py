"""
Authentication Service
"""
from datetime import datetime
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from app.models.user import User
from app.utils.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_token_type
)


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """
    Authenticate a user with email and password

    Args:
        db: Database session
        email: User email
        password: Plain text password

    Returns:
        User object if authentication successful, None otherwise
    """
    user = db.query(User).filter(User.email == email).first()

    if not user:
        return None

    if not user.is_active:
        return None

    if not verify_password(password, user.password_hash):
        return None

    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()

    return user


def create_user_tokens(user: User) -> Tuple[str, str]:
    """
    Create access and refresh tokens for a user

    Args:
        user: User object

    Returns:
        Tuple of (access_token, refresh_token)
    """
    token_data = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "org_id": str(user.organization_id),
        "client_id": str(user.client_id) if user.client_id else None,
    }

    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token({"sub": str(user.id)})

    return access_token, refresh_token


def decode_access_token(token: str) -> Optional[dict]:
    """
    Decode and validate an access token

    Args:
        token: JWT access token

    Returns:
        Decoded payload or None if invalid
    """
    payload = decode_token(token)

    if payload is None:
        return None

    if not verify_token_type(payload, "access"):
        return None

    return payload


def decode_refresh_token(token: str) -> Optional[dict]:
    """
    Decode and validate a refresh token

    Args:
        token: JWT refresh token

    Returns:
        Decoded payload or None if invalid
    """
    payload = decode_token(token)

    if payload is None:
        return None

    if not verify_token_type(payload, "refresh"):
        return None

    return payload


def refresh_access_token(db: Session, refresh_token: str) -> Optional[str]:
    """
    Create a new access token from a refresh token

    Args:
        db: Database session
        refresh_token: JWT refresh token

    Returns:
        New access token or None if invalid
    """
    payload = decode_refresh_token(refresh_token)

    if payload is None:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    user = db.query(User).filter(User.id == user_id).first()

    if not user or not user.is_active:
        return None

    token_data = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "org_id": str(user.organization_id),
        "client_id": str(user.client_id) if user.client_id else None,
    }

    return create_access_token(token_data)


def create_user(
    db: Session,
    email: str,
    password: str,
    full_name: str,
    organization_id: str,
    role: str = "client"
) -> User:
    """
    Create a new user

    Args:
        db: Database session
        email: User email
        password: Plain text password
        full_name: User's full name
        organization_id: Organization ID
        role: User role (default: client)

    Returns:
        Created user object
    """
    hashed_password = hash_password(password)

    user = User(
        email=email,
        password_hash=hashed_password,
        full_name=full_name,
        organization_id=organization_id,
        role=role
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user
