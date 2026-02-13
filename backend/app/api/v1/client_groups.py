"""
Client Groups API — CRUD for grouping clients for aggregated analytics.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import uuid as uuid_lib

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.models.client import Client, user_clients
from app.models.client_group import ClientGroup, client_group_members
from app.schemas.client_group import (
    ClientGroupCreate,
    ClientGroupUpdate,
    ClientGroupResponse,
    ClientGroupList,
)

router = APIRouter(prefix="/client-groups", tags=["client-groups"])


def _get_user_accessible_client_ids(db: Session, user) -> set:
    """Get client IDs accessible to this user based on role/client assignment."""
    from app.models.user import UserRole

    role_val = user.role.value if isinstance(user.role, UserRole) else user.role

    # Admin/superadmin: all org clients
    if role_val in ("admin", "superadmin"):
        rows = db.query(Client.id).filter(
            Client.organization_id == user.organization_id
        ).all()
        return {str(r[0]) for r in rows}

    # Client role: just their client
    if role_val == "client" and user.client_id:
        return {str(user.client_id)}

    # Multi-client roles: assigned clients
    multi_rows = db.query(user_clients.c.client_id).filter(
        user_clients.c.user_id == user.id
    ).all()
    client_ids = [r[0] for r in multi_rows]
    if client_ids:
        return {str(cid) for cid in client_ids}

    # Fallback: legacy client_id
    if user.client_id:
        return {str(user.client_id)}

    return set()


def _build_group_response(db: Session, group: ClientGroup, accessible_ids: set = None) -> ClientGroupResponse:
    """Build a ClientGroupResponse, optionally filtering to accessible clients."""
    member_rows = db.query(
        client_group_members.c.client_id
    ).filter(
        client_group_members.c.client_group_id == group.id
    ).all()
    all_client_ids = [str(r[0]) for r in member_rows]

    # Filter to accessible clients if provided
    if accessible_ids is not None:
        client_ids = [cid for cid in all_client_ids if cid in accessible_ids]
    else:
        client_ids = all_client_ids

    # Resolve client names
    client_names = []
    if client_ids:
        name_rows = db.query(Client.id, Client.name).filter(
            Client.id.in_(client_ids)
        ).all()
        name_map = {str(r[0]): r[1] for r in name_rows}
        client_names = [name_map.get(cid, "Unknown") for cid in client_ids]

    return ClientGroupResponse(
        id=str(group.id),
        name=group.name,
        is_active=group.is_active,
        client_ids=client_ids,
        client_names=client_names,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


@router.get("", response_model=ClientGroupList)
async def list_client_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List client groups. Non-admin users only see groups with clients they can access."""
    accessible_ids = _get_user_accessible_client_ids(db, current_user)

    groups = db.query(ClientGroup).filter(
        ClientGroup.organization_id == current_user.organization_id,
        ClientGroup.is_active == True,  # noqa: E712
    ).order_by(ClientGroup.name).all()

    result = []
    for group in groups:
        resp = _build_group_response(db, group, accessible_ids)
        # Only include groups that have at least one accessible client
        if resp.client_ids:
            result.append(resp)

    return ClientGroupList(client_groups=result, total=len(result))


@router.post("", response_model=ClientGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_client_group(
    data: ClientGroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"])),
):
    """Create a new client group (admin only)."""
    group = ClientGroup(
        organization_id=current_user.organization_id,
        name=data.name,
    )
    db.add(group)
    db.flush()

    for cid in data.client_ids:
        db.execute(client_group_members.insert().values(
            id=uuid_lib.uuid4(),
            client_group_id=group.id,
            client_id=uuid_lib.UUID(cid),
        ))

    db.commit()
    db.refresh(group)
    return _build_group_response(db, group)


@router.patch("/{group_id}", response_model=ClientGroupResponse)
async def update_client_group(
    group_id: str,
    data: ClientGroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"])),
):
    """Update a client group (admin only)."""
    group = db.query(ClientGroup).filter(
        ClientGroup.id == uuid_lib.UUID(group_id),
        ClientGroup.organization_id == current_user.organization_id,
    ).first()

    if not group:
        raise HTTPException(status_code=404, detail="Client group not found")

    if data.name is not None:
        group.name = data.name

    if data.client_ids is not None:
        # Replace all members
        db.execute(
            client_group_members.delete().where(
                client_group_members.c.client_group_id == group.id
            )
        )
        for cid in data.client_ids:
            db.execute(client_group_members.insert().values(
                id=uuid_lib.uuid4(),
                client_group_id=group.id,
                client_id=uuid_lib.UUID(cid),
            ))

    db.commit()
    db.refresh(group)
    return _build_group_response(db, group)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client_group(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"])),
):
    """Delete a client group (admin only)."""
    group = db.query(ClientGroup).filter(
        ClientGroup.id == uuid_lib.UUID(group_id),
        ClientGroup.organization_id == current_user.organization_id,
    ).first()

    if not group:
        raise HTTPException(status_code=404, detail="Client group not found")

    db.delete(group)
    db.commit()
    return None
