"""
Common Dependencies for FastAPI Routes
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional, List, Callable

from app.database import get_db
from app.services.auth_service import decode_access_token
from app.models.user import User
from app.models.role_permission import RolePermission

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Dependency to get the current authenticated user
    """
    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get current active user"""
    return current_user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Require admin or superadmin role"""
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )
    return current_user


async def get_current_superadmin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Require superadmin role"""
    if current_user.role != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )
    return current_user


def require_role(allowed_roles: List[str]) -> Callable:
    """
    Dependency factory to require specific roles

    Usage:
        @router.get("/", dependencies=[Depends(require_role(["admin", "superadmin"]))])
        or
        current_user: User = Depends(require_role(["admin", "superadmin"]))
    """
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {', '.join(allowed_roles)}",
            )
        return current_user

    return role_checker


def require_permission(*keys: str) -> Callable:
    """
    Dependency factory to require specific permission(s).
    Admin/superadmin roles always bypass the check.

    Usage:
        current_user: User = Depends(require_permission("report:tax_report"))
        or
        @router.get("/", dependencies=[Depends(require_permission("page:sales"))])
    """
    async def permission_checker(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if current_user.role in ("admin", "superadmin"):
            return current_user

        for key in keys:
            perm = db.query(RolePermission).filter(
                RolePermission.organization_id == current_user.organization_id,
                RolePermission.role == current_user.role,
                RolePermission.permission_key == key,
                RolePermission.granted == True,
            ).first()
            if not perm:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission required: {key}",
                )
        return current_user

    return permission_checker
