"""
Location Groups API — CRUD for grouping locations for aggregated analytics.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid as uuid_lib

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.models.location import Location
from app.models.location_group import LocationGroup, location_group_members
from app.models.square_account import SquareAccount
from app.models.client import Client, client_locations, user_clients
from app.schemas.location_group import (
    LocationGroupCreate,
    LocationGroupUpdate,
    LocationGroupResponse,
    LocationGroupList,
)

router = APIRouter(prefix="/location-groups", tags=["location-groups"])


def _get_user_accessible_location_ids(db: Session, user) -> set:
    """Get location IDs accessible to this user based on role/client assignment."""
    from app.models.user import UserRole

    role_val = user.role.value if isinstance(user.role, UserRole) else user.role

    # Admin/superadmin: all org locations
    if role_val in ("admin", "superadmin"):
        rows = db.query(Location.id).join(SquareAccount).filter(
            SquareAccount.organization_id == user.organization_id
        ).all()
        return {str(r[0]) for r in rows}

    # Client role: locations assigned to their client
    if role_val == "client" and user.client_id:
        rows = db.query(client_locations.c.location_id).filter(
            client_locations.c.client_id == user.client_id
        ).all()
        return {str(r[0]) for r in rows}

    # Multi-client roles: union of all assigned client locations
    multi_rows = db.query(user_clients.c.client_id).filter(
        user_clients.c.user_id == user.id
    ).all()
    client_ids = [r[0] for r in multi_rows]
    if client_ids:
        rows = db.query(client_locations.c.location_id).filter(
            client_locations.c.client_id.in_(client_ids)
        ).all()
        return {str(r[0]) for r in rows}

    # Fallback: legacy client_id
    if user.client_id:
        rows = db.query(client_locations.c.location_id).filter(
            client_locations.c.client_id == user.client_id
        ).all()
        return {str(r[0]) for r in rows}

    return set()


def _build_group_response(db: Session, group: LocationGroup, accessible_ids: set = None) -> LocationGroupResponse:
    """Build a LocationGroupResponse, optionally filtering to accessible locations."""
    member_rows = db.query(
        location_group_members.c.location_id
    ).filter(
        location_group_members.c.location_group_id == group.id
    ).all()
    all_location_ids = [str(r[0]) for r in member_rows]

    # Filter to accessible locations if provided
    if accessible_ids is not None:
        location_ids = [lid for lid in all_location_ids if lid in accessible_ids]
    else:
        location_ids = all_location_ids

    # Resolve location names
    location_names = []
    if location_ids:
        name_rows = db.query(Location.id, Location.name).filter(
            Location.id.in_(location_ids)
        ).all()
        name_map = {str(r[0]): r[1] for r in name_rows}
        location_names = [name_map.get(lid, "Unknown") for lid in location_ids]

    return LocationGroupResponse(
        id=str(group.id),
        name=group.name,
        is_active=group.is_active,
        location_ids=location_ids,
        location_names=location_names,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


@router.get("", response_model=LocationGroupList)
async def list_location_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List location groups. Non-admin users only see groups with locations they can access."""
    accessible_ids = _get_user_accessible_location_ids(db, current_user)

    groups = db.query(LocationGroup).filter(
        LocationGroup.organization_id == current_user.organization_id,
        LocationGroup.is_active == True,  # noqa: E712
    ).order_by(LocationGroup.name).all()

    result = []
    for group in groups:
        resp = _build_group_response(db, group, accessible_ids)
        # Only include groups that have at least one accessible location
        if resp.location_ids:
            result.append(resp)

    return LocationGroupList(location_groups=result, total=len(result))


@router.post("", response_model=LocationGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_location_group(
    data: LocationGroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"])),
):
    """Create a new location group (admin only)."""
    group = LocationGroup(
        organization_id=current_user.organization_id,
        name=data.name,
    )
    db.add(group)
    db.flush()

    for lid in data.location_ids:
        db.execute(location_group_members.insert().values(
            id=uuid_lib.uuid4(),
            location_group_id=group.id,
            location_id=uuid_lib.UUID(lid),
        ))

    db.commit()
    db.refresh(group)
    return _build_group_response(db, group)


@router.patch("/{group_id}", response_model=LocationGroupResponse)
async def update_location_group(
    group_id: str,
    data: LocationGroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"])),
):
    """Update a location group (admin only)."""
    group = db.query(LocationGroup).filter(
        LocationGroup.id == uuid_lib.UUID(group_id),
        LocationGroup.organization_id == current_user.organization_id,
    ).first()

    if not group:
        raise HTTPException(status_code=404, detail="Location group not found")

    if data.name is not None:
        group.name = data.name

    if data.location_ids is not None:
        # Replace all members
        db.execute(
            location_group_members.delete().where(
                location_group_members.c.location_group_id == group.id
            )
        )
        for lid in data.location_ids:
            db.execute(location_group_members.insert().values(
                id=uuid_lib.uuid4(),
                location_group_id=group.id,
                location_id=uuid_lib.UUID(lid),
            ))

    db.commit()
    db.refresh(group)
    return _build_group_response(db, group)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_location_group(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"])),
):
    """Delete a location group (admin only)."""
    group = db.query(LocationGroup).filter(
        LocationGroup.id == uuid_lib.UUID(group_id),
        LocationGroup.organization_id == current_user.organization_id,
    ).first()

    if not group:
        raise HTTPException(status_code=404, detail="Location group not found")

    db.delete(group)
    db.commit()
    return None
