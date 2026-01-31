"""
User Management API Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, get_current_admin_user
from app.models.user import User, UserRole
from app.models.client import Client, user_clients
from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserListResponse
from app.services.auth_service import create_user

router = APIRouter(tags=["users"])

VALID_ROLES = {r.value for r in UserRole}
CLIENT_LINKABLE_ROLES = {"client", "store_manager", "reporting", "manager"}
MULTI_CLIENT_ROLES = {"store_manager", "reporting", "manager"}
ADMIN_ROLES = {"admin", "superadmin"}


def _build_user_response(user: User) -> UserResponse:
    """Build a UserResponse from a User model instance."""
    role_val = user.role.value if isinstance(user.role, UserRole) else user.role

    # For multi-client roles, include assigned_clients list
    assigned_ids = None
    assigned_names = None
    if role_val in MULTI_CLIENT_ROLES and user.assigned_clients:
        assigned_ids = [str(c.id) for c in user.assigned_clients]
        assigned_names = [c.name for c in user.assigned_clients]

    return UserResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=role_val,
        organization_id=str(user.organization_id),
        client_id=str(user.client_id) if user.client_id else None,
        client_name=user.client.name if user.client else None,
        client_ids=assigned_ids,
        client_names=assigned_names,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's profile."""
    if current_user.client_id and not current_user.client:
        db.refresh(current_user, ["client"])
    role_val = current_user.role.value if isinstance(current_user.role, UserRole) else current_user.role
    if role_val in MULTI_CLIENT_ROLES:
        db.refresh(current_user, ["assigned_clients"])
    return _build_user_response(current_user)


@router.get("", response_model=UserListResponse)
async def list_users(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """List all users in the admin's organization."""
    users = (
        db.query(User)
        .options(joinedload(User.client), joinedload(User.assigned_clients))
        .filter(User.organization_id == current_user.organization_id)
        .order_by(User.created_at.desc())
        .all()
    )
    return UserListResponse(
        users=[_build_user_response(u) for u in users],
        total=len(users),
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_new_user(
    data: UserCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Create a new user in the admin's organization."""
    if data.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role '{data.role}'. Valid roles: {', '.join(sorted(VALID_ROLES))}",
        )

    if data.role == "client" and not data.client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client role requires a client_id",
        )
    if data.role in ADMIN_ROLES and data.client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin/superadmin roles cannot be linked to a client",
        )

    if data.client_id:
        client_obj = db.query(Client).filter(
            Client.id == data.client_id,
            Client.organization_id == current_user.organization_id,
        ).first()
        if not client_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Client not found in your organization",
            )

    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user = create_user(
        db=db,
        email=data.email,
        password=data.password,
        full_name=data.full_name,
        organization_id=str(current_user.organization_id),
        role=data.role,
    )

    # Handle client assignment based on role
    if data.role == "client" and data.client_id:
        user.client_id = data.client_id
        db.commit()
        db.refresh(user)
    elif data.role in MULTI_CLIENT_ROLES:
        # Accept client_ids list, or fall back to single client_id
        ids_to_assign = data.client_ids or ([data.client_id] if data.client_id else [])
        for cid in ids_to_assign:
            c = db.query(Client).filter(
                Client.id == cid,
                Client.organization_id == current_user.organization_id,
            ).first()
            if not c:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Client {cid} not found")
            db.execute(user_clients.insert().values(user_id=user.id, client_id=cid))
        # Set client_id for backward compat if exactly one client
        if len(ids_to_assign) == 1:
            user.client_id = ids_to_assign[0]
        else:
            user.client_id = None
        db.commit()
        db.refresh(user)
    elif data.client_id and data.role in CLIENT_LINKABLE_ROLES:
        user.client_id = data.client_id
        db.commit()
        db.refresh(user)

    if user.client_id:
        db.refresh(user, ["client"])
    role_val = user.role.value if isinstance(user.role, UserRole) else user.role
    if role_val in MULTI_CLIENT_ROLES:
        db.refresh(user, ["assigned_clients"])

    return _build_user_response(user)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Get a user by ID."""
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id,
    ).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _build_user_response(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    data: UserUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Update a user's details."""
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id,
    ).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if str(user.id) == str(current_user.id) and data.role and data.role not in ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role to non-admin",
        )

    new_role = data.role or (user.role.value if isinstance(user.role, UserRole) else user.role)
    if data.role and data.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role '{data.role}'",
        )

    new_client_id = user.client_id
    if hasattr(data, 'model_fields_set') and "client_id" in data.model_fields_set:
        new_client_id = data.client_id

    if new_role == "client" and not new_client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client role requires a client_id",
        )
    if new_role in ADMIN_ROLES and new_client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin/superadmin roles cannot be linked to a client",
        )

    if new_client_id:
        client_obj = db.query(Client).filter(
            Client.id == new_client_id,
            Client.organization_id == current_user.organization_id,
        ).first()
        if not client_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Client not found in your organization",
            )

    if data.email is not None:
        existing = db.query(User).filter(User.email == data.email, User.id != user.id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
        user.email = data.email
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active

    # Handle client assignment changes
    if new_role in MULTI_CLIENT_ROLES:
        if hasattr(data, 'model_fields_set') and "client_ids" in data.model_fields_set:
            # Replace all user_clients rows
            db.execute(user_clients.delete().where(user_clients.c.user_id == user.id))
            if data.client_ids:
                for cid in data.client_ids:
                    c = db.query(Client).filter(
                        Client.id == cid,
                        Client.organization_id == current_user.organization_id,
                    ).first()
                    if not c:
                        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Client {cid} not found")
                    db.execute(user_clients.insert().values(user_id=user.id, client_id=cid))
                user.client_id = data.client_ids[0] if len(data.client_ids) == 1 else None
            else:
                user.client_id = None
        elif hasattr(data, 'model_fields_set') and "client_id" in data.model_fields_set:
            # Backward compat: single client_id update
            user.client_id = data.client_id
    elif new_role in ADMIN_ROLES:
        # Clear multi-client assignments when switching to admin
        db.execute(user_clients.delete().where(user_clients.c.user_id == user.id))
        user.client_id = None
    elif hasattr(data, 'model_fields_set') and "client_id" in data.model_fields_set:
        user.client_id = data.client_id

    db.commit()
    db.refresh(user)
    if user.client_id:
        db.refresh(user, ["client"])
    if new_role in MULTI_CLIENT_ROLES:
        db.refresh(user, ["assigned_clients"])

    return _build_user_response(user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Deactivate a user (soft delete)."""
    if str(current_user.id) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate yourself",
        )

    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id,
    ).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False
    db.commit()

    return {"message": f"User {user.email} deactivated"}
