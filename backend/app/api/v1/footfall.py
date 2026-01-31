"""
Footfall API Endpoints
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import date
import uuid as uuid_lib

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.footfall import FootfallEntry
from app.models.location import Location
from app.models.client import client_locations, user_clients
from app.models.square_account import SquareAccount
from app.models.role_permission import RolePermission
from app.schemas.footfall import (
    FootfallCreate, FootfallUpdate, FootfallResponse, FootfallListResponse,
)

router = APIRouter(tags=["footfall"])

ADMIN_ROLES = ("superadmin", "admin")


def _get_accessible_location_ids(db: Session, user: User) -> list:
    """Get location UUIDs the user can access, scoped by role and client assignments."""
    if user.role in ADMIN_ROLES:
        rows = db.query(Location.id).join(SquareAccount).filter(
            SquareAccount.organization_id == user.organization_id
        ).all()
        return [r[0] for r in rows]

    # Multi-client roles: use assigned_clients -> client_locations
    assigned_client_ids = [
        r[0] for r in db.query(user_clients.c.client_id).filter(
            user_clients.c.user_id == user.id
        ).all()
    ]

    # Fallback: single client_id
    if not assigned_client_ids and user.client_id:
        assigned_client_ids = [user.client_id]

    if not assigned_client_ids:
        return []

    rows = db.query(client_locations.c.location_id).filter(
        client_locations.c.client_id.in_(assigned_client_ids)
    ).all()
    return [r[0] for r in rows]


def _has_manage_permission(db: Session, user: User) -> bool:
    """Check if user has feature:manage_footfall."""
    if user.role in ADMIN_ROLES:
        return True
    perm = db.query(RolePermission).filter(
        RolePermission.organization_id == user.organization_id,
        RolePermission.role == user.role,
        RolePermission.permission_key == "feature:manage_footfall",
        RolePermission.granted == True,  # noqa: E712
    ).first()
    return perm is not None


def _entry_to_response(entry: FootfallEntry, location_name: str = None, creator_name: str = None) -> FootfallResponse:
    return FootfallResponse(
        id=str(entry.id),
        organization_id=str(entry.organization_id),
        location_id=str(entry.location_id),
        date=entry.date,
        count=entry.count,
        created_by=str(entry.created_by),
        updated_by=str(entry.updated_by) if entry.updated_by else None,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        location_name=location_name,
        creator_name=creator_name,
    )


@router.get("/", response_model=FootfallListResponse)
async def list_footfall_entries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    location_id: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    accessible = _get_accessible_location_ids(db, current_user)
    if not accessible:
        return FootfallListResponse(entries=[], total=0, page=page, page_size=page_size)

    query = db.query(FootfallEntry).filter(
        FootfallEntry.organization_id == current_user.organization_id,
        FootfallEntry.location_id.in_(accessible),
    )

    if location_id:
        loc_uuid = uuid_lib.UUID(location_id)
        if loc_uuid not in accessible:
            raise HTTPException(status_code=403, detail="No access to this location")
        query = query.filter(FootfallEntry.location_id == loc_uuid)

    if start_date:
        query = query.filter(FootfallEntry.date >= start_date)
    if end_date:
        query = query.filter(FootfallEntry.date <= end_date)

    total = query.count()
    entries = query.order_by(desc(FootfallEntry.date), FootfallEntry.location_id).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    # Enrich with names
    loc_ids = {e.location_id for e in entries}
    locs = {}
    if loc_ids:
        locs = {loc.id: loc.name for loc in db.query(Location).filter(Location.id.in_(loc_ids)).all()}

    creator_ids = {e.created_by for e in entries}
    creators = {}
    if creator_ids:
        creators = {u.id: u.full_name for u in db.query(User).filter(User.id.in_(creator_ids)).all()}

    return FootfallListResponse(
        entries=[_entry_to_response(e, locs.get(e.location_id), creators.get(e.created_by)) for e in entries],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/", response_model=FootfallResponse, status_code=status.HTTP_201_CREATED)
async def create_footfall_entry(
    payload: FootfallCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _has_manage_permission(db, current_user):
        raise HTTPException(status_code=403, detail="Missing feature:manage_footfall permission")

    accessible = _get_accessible_location_ids(db, current_user)
    loc_uuid = uuid_lib.UUID(payload.location_id)
    if loc_uuid not in accessible:
        raise HTTPException(status_code=403, detail="No access to this location")

    existing = db.query(FootfallEntry).filter(
        FootfallEntry.organization_id == current_user.organization_id,
        FootfallEntry.location_id == loc_uuid,
        FootfallEntry.date == payload.date,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Footfall entry already exists for this location and date")

    entry = FootfallEntry(
        id=uuid_lib.uuid4(),
        organization_id=current_user.organization_id,
        location_id=loc_uuid,
        date=payload.date,
        count=payload.count,
        created_by=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    loc = db.query(Location).filter(Location.id == entry.location_id).first()
    return _entry_to_response(entry, loc.name if loc else None, current_user.full_name)


@router.put("/{entry_id}", response_model=FootfallResponse)
async def update_footfall_entry(
    entry_id: str,
    payload: FootfallUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _has_manage_permission(db, current_user):
        raise HTTPException(status_code=403, detail="Missing feature:manage_footfall permission")

    entry = db.query(FootfallEntry).filter(FootfallEntry.id == uuid_lib.UUID(entry_id)).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    is_admin = current_user.role in ADMIN_ROLES
    if entry.created_by != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Only the creator or an admin can edit this entry")

    entry.count = payload.count
    entry.updated_by = current_user.id
    db.commit()
    db.refresh(entry)

    loc = db.query(Location).filter(Location.id == entry.location_id).first()
    creator = db.query(User).filter(User.id == entry.created_by).first()
    return _entry_to_response(entry, loc.name if loc else None, creator.full_name if creator else None)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_footfall_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _has_manage_permission(db, current_user):
        raise HTTPException(status_code=403, detail="Missing feature:manage_footfall permission")

    entry = db.query(FootfallEntry).filter(FootfallEntry.id == uuid_lib.UUID(entry_id)).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    is_admin = current_user.role in ADMIN_ROLES
    if entry.created_by != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Only the creator or an admin can delete this entry")

    db.delete(entry)
    db.commit()
