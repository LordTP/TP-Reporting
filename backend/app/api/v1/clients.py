"""
Clients API Endpoints
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.client import Client, client_locations, user_clients
from app.models.location import Location
from app.schemas.client import (
    ClientCreate,
    ClientUpdate,
    ClientResponse,
    ClientList,
    ClientLocationAssignment
)

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=ClientList)
async def list_clients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    """
    List all clients for the organization.
    Non-admin users with assigned clients only see their assigned clients.
    """
    query = db.query(Client).filter(
        Client.organization_id == current_user.organization_id
    )

    # Scope for non-admin users
    role_val = current_user.role.value if isinstance(current_user.role, UserRole) else current_user.role
    MULTI_CLIENT_ROLES = {"store_manager", "reporting", "manager"}
    if role_val in MULTI_CLIENT_ROLES:
        allowed_ids = db.query(user_clients.c.client_id).filter(
            user_clients.c.user_id == current_user.id
        ).all()
        allowed_ids = [r[0] for r in allowed_ids]
        if allowed_ids:
            query = query.filter(Client.id.in_(allowed_ids))
        else:
            # Fallback to single client_id
            if current_user.client_id:
                query = query.filter(Client.id == current_user.client_id)
            else:
                query = query.filter(False)
    elif role_val == "client" and current_user.client_id:
        query = query.filter(Client.id == current_user.client_id)

    total = query.count()
    clients = query.offset(skip).limit(limit).all()

    # Count locations for each client
    clients_data = []
    for client in clients:
        location_count = db.query(client_locations).filter(
            client_locations.c.client_id == client.id
        ).count()

        clients_data.append(ClientResponse(
            id=str(client.id),
            organization_id=str(client.organization_id),
            name=client.name,
            email=client.email,
            is_active=client.is_active,
            category_keywords=client.category_keywords,
            created_at=client.created_at,
            updated_at=client.updated_at,
            location_count=location_count
        ))

    return ClientList(clients=clients_data, total=total)


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    client_data: ClientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"]))
):
    """
    Create a new client (Admin only)
    """
    client = Client(
        organization_id=current_user.organization_id,
        name=client_data.name,
        email=client_data.email,
        is_active=client_data.is_active,
        category_keywords=client_data.category_keywords
    )

    db.add(client)
    db.commit()
    db.refresh(client)

    return ClientResponse(
        id=str(client.id),
        organization_id=str(client.organization_id),
        name=client.name,
        email=client.email,
        is_active=client.is_active,
        category_keywords=client.category_keywords,
        created_at=client.created_at,
        updated_at=client.updated_at,
        location_count=0
    )


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific client
    """
    client = db.query(Client).filter(
        Client.id == client_id,
        Client.organization_id == current_user.organization_id
    ).first()

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )

    location_count = db.query(client_locations).filter(
        client_locations.c.client_id == client.id
    ).count()

    return ClientResponse(
        id=str(client.id),
        organization_id=str(client.organization_id),
        name=client.name,
        email=client.email,
        is_active=client.is_active,
        category_keywords=client.category_keywords,
        created_at=client.created_at,
        updated_at=client.updated_at,
        location_count=location_count
    )


@router.patch("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: str,
    client_data: ClientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"]))
):
    """
    Update a client (Admin only)
    """
    client = db.query(Client).filter(
        Client.id == client_id,
        Client.organization_id == current_user.organization_id
    ).first()

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )

    # Update fields
    if client_data.name is not None:
        client.name = client_data.name
    if client_data.email is not None:
        client.email = client_data.email
    if client_data.is_active is not None:
        client.is_active = client_data.is_active
    keywords_changed = False
    if client_data.category_keywords is not None:
        client.category_keywords = client_data.category_keywords
        keywords_changed = True

    db.commit()
    db.refresh(client)

    # Recompute product mappings if keywords changed
    if keywords_changed:
        from app.services.client_catalog_service import recompute_client_mappings
        recompute_client_mappings(db, client_id=client_id)

    location_count = db.query(client_locations).filter(
        client_locations.c.client_id == client.id
    ).count()

    return ClientResponse(
        id=str(client.id),
        organization_id=str(client.organization_id),
        name=client.name,
        email=client.email,
        is_active=client.is_active,
        category_keywords=client.category_keywords,
        created_at=client.created_at,
        updated_at=client.updated_at,
        location_count=location_count
    )


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"]))
):
    """
    Delete a client (Admin only)
    """
    client = db.query(Client).filter(
        Client.id == client_id,
        Client.organization_id == current_user.organization_id
    ).first()

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )

    db.delete(client)
    db.commit()
    return None


@router.post("/{client_id}/locations", status_code=status.HTTP_200_OK)
async def assign_locations_to_client(
    client_id: str,
    assignment: ClientLocationAssignment,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"]))
):
    """
    Assign locations to a client (replaces existing assignments)
    """
    client = db.query(Client).filter(
        Client.id == client_id,
        Client.organization_id == current_user.organization_id
    ).first()

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )

    # Remove existing assignments
    db.execute(
        client_locations.delete().where(client_locations.c.client_id == client_id)
    )

    # Add new assignments
    for location_id in assignment.location_ids:
        # Verify location belongs to organization
        location = db.query(Location).join(Location.square_account).filter(
            Location.id == location_id,
        ).first()

        if location:
            db.execute(
                client_locations.insert().values(
                    client_id=client_id,
                    location_id=location_id
                )
            )

    db.commit()

    return {"message": "Locations assigned successfully"}


@router.get("/{client_id}/locations")
async def get_client_locations(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all locations assigned to a client
    """
    client = db.query(Client).filter(
        Client.id == client_id,
        Client.organization_id == current_user.organization_id
    ).first()

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )

    # Get location IDs
    location_ids = db.query(client_locations.c.location_id).filter(
        client_locations.c.client_id == client_id
    ).all()

    location_ids = [str(loc_id[0]) for loc_id in location_ids]

    # Get location details
    locations = db.query(Location).filter(Location.id.in_(location_ids)).all()

    locations_data = [
        {
            "id": str(loc.id),
            "name": loc.name,
            "square_location_id": loc.square_location_id,
            "currency": loc.currency,
            "is_active": loc.is_active
        }
        for loc in locations
    ]

    return {"locations": locations_data, "total": len(locations_data)}


@router.put("/{client_id}/category-keywords", status_code=status.HTTP_200_OK)
async def update_category_keywords(
    client_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"]))
):
    """
    Update category keywords for a client (Admin only).
    Body: { "keywords": ["Warner Music", ...] }
    """
    client = db.query(Client).filter(
        Client.id == client_id,
        Client.organization_id == current_user.organization_id
    ).first()

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )

    keywords = body.get("keywords", [])
    client.category_keywords = keywords if keywords else None

    db.commit()
    db.refresh(client)

    # Recompute pre-computed product mappings for this client
    from app.services.client_catalog_service import recompute_client_mappings
    mappings_count = recompute_client_mappings(db, client_id=client_id)

    return {
        "message": "Category keywords updated",
        "category_keywords": client.category_keywords,
        "products_matched": mappings_count,
    }
