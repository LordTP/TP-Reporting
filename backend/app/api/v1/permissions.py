"""
Role Permission Management API
"""
import uuid as uuid_lib
from datetime import datetime
from typing import Dict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, get_current_admin_user
from app.models.user import User
from app.models.role_permission import RolePermission
from app.config.permissions import (
    ALL_PERMISSIONS, CONFIGURABLE_ROLES, FULL_ACCESS_ROLES, DEFAULT_PERMISSIONS,
)
from app.schemas.permission import (
    PermissionMatrixResponse, PermissionMatrixUpdate, MyPermissionsResponse, PermissionKeyInfo,
)

router = APIRouter()


def _seed_defaults(db: Session, organization_id, updated_by=None):
    """Insert default permission rows for an organization."""
    for role in CONFIGURABLE_ROLES:
        granted_keys = DEFAULT_PERMISSIONS.get(role, set())
        for key in ALL_PERMISSIONS:
            db.add(RolePermission(
                id=uuid_lib.uuid4(),
                organization_id=organization_id,
                role=role,
                permission_key=key,
                granted=(key in granted_keys),
                updated_at=datetime.utcnow(),
                updated_by=updated_by,
            ))
    db.commit()


def _get_matrix(db: Session, organization_id) -> Dict[str, Dict[str, bool]]:
    """Return {role: {permission_key: granted}} for an org."""
    rows = db.query(RolePermission).filter(
        RolePermission.organization_id == organization_id,
    ).all()
    matrix: Dict[str, Dict[str, bool]] = {role: {} for role in CONFIGURABLE_ROLES}
    for row in rows:
        if row.role in matrix and row.permission_key in ALL_PERMISSIONS:
            matrix[row.role][row.permission_key] = row.granted
    return matrix


@router.get("/matrix", response_model=PermissionMatrixResponse)
async def get_permission_matrix(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Get the full permission matrix for all configurable roles.
    Auto-seeds defaults if the organization has no permission rows yet."""
    org_id = current_user.organization_id

    count = db.query(RolePermission).filter(
        RolePermission.organization_id == org_id,
    ).count()

    if count == 0:
        _seed_defaults(db, org_id, updated_by=current_user.id)

    matrix = _get_matrix(db, org_id)

    permissions = [
        PermissionKeyInfo(key=key, label=info["label"], category=info["category"])
        for key, info in ALL_PERMISSIONS.items()
    ]

    return PermissionMatrixResponse(permissions=permissions, matrix=matrix)


@router.put("/matrix", response_model=PermissionMatrixResponse)
async def update_permission_matrix(
    data: PermissionMatrixUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Save the updated permission matrix. Upserts all rows."""
    org_id = current_user.organization_id

    for role, perms in data.matrix.items():
        if role not in CONFIGURABLE_ROLES:
            continue
        for key, granted in perms.items():
            if key not in ALL_PERMISSIONS:
                continue
            existing = db.query(RolePermission).filter(
                RolePermission.organization_id == org_id,
                RolePermission.role == role,
                RolePermission.permission_key == key,
            ).first()

            if existing:
                existing.granted = granted
                existing.updated_at = datetime.utcnow()
                existing.updated_by = current_user.id
            else:
                db.add(RolePermission(
                    id=uuid_lib.uuid4(),
                    organization_id=org_id,
                    role=role,
                    permission_key=key,
                    granted=granted,
                    updated_at=datetime.utcnow(),
                    updated_by=current_user.id,
                ))

    db.commit()

    matrix = _get_matrix(db, org_id)
    permissions = [
        PermissionKeyInfo(key=key, label=info["label"], category=info["category"])
        for key, info in ALL_PERMISSIONS.items()
    ]
    return PermissionMatrixResponse(permissions=permissions, matrix=matrix)


@router.get("/me", response_model=MyPermissionsResponse)
async def get_my_permissions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the flat list of granted permission keys for the current user.
    Admin/superadmin always get ALL keys."""
    role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

    if role_val in FULL_ACCESS_ROLES:
        return MyPermissionsResponse(permissions=list(ALL_PERMISSIONS.keys()))

    org_id = current_user.organization_id

    # Check if org has been seeded
    count = db.query(RolePermission).filter(
        RolePermission.organization_id == org_id,
    ).count()

    if count == 0:
        # Fall back to defaults without seeding (non-admin can't seed)
        defaults = DEFAULT_PERMISSIONS.get(role_val, set())
        return MyPermissionsResponse(permissions=list(defaults))

    rows = db.query(RolePermission).filter(
        RolePermission.organization_id == org_id,
        RolePermission.role == role_val,
        RolePermission.granted == True,  # noqa: E712
    ).all()

    granted = [row.permission_key for row in rows if row.permission_key in ALL_PERMISSIONS]
    return MyPermissionsResponse(permissions=granted)
