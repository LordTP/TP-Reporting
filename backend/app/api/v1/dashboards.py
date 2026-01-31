"""
Dashboards API Endpoints
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.models.dashboard import Dashboard, DashboardLocation, UserDashboardPermission
from app.models.location import Location
from app.models.square_account import SquareAccount
from app.schemas.dashboard import (
    DashboardCreate,
    DashboardUpdate,
    DashboardResponse,
    DashboardList,
    DashboardLocationCreate,
    UserDashboardPermissionCreate,
)

router = APIRouter(tags=["dashboards"])


@router.get("/", response_model=DashboardList)
async def list_dashboards(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    """
    List dashboards accessible by current user
    """
    # Admins see all org dashboards, others see only their permitted dashboards
    if current_user.role in ["admin", "superadmin"]:
        query = db.query(Dashboard).filter(
            Dashboard.organization_id == current_user.organization_id
        )
    else:
        # Get dashboards user has permission to access
        permitted_dashboard_ids = db.query(UserDashboardPermission.dashboard_id).filter(
            UserDashboardPermission.user_id == current_user.id
        ).subquery()

        query = db.query(Dashboard).filter(
            and_(
                Dashboard.organization_id == current_user.organization_id,
                or_(
                    Dashboard.created_by == current_user.id,
                    Dashboard.id.in_(permitted_dashboard_ids)
                )
            )
        )

    total = query.count()
    dashboards = query.offset(skip).limit(limit).all()

    # Convert to response with location IDs
    dashboards_data = []
    for dash in dashboards:
        location_ids = [str(dl.location_id) for dl in dash.dashboard_locations]
        dashboards_data.append({
            "id": str(dash.id),
            "organization_id": str(dash.organization_id),
            "name": dash.name,
            "description": dash.description,
            "config": dash.config,
            "created_by": str(dash.created_by),
            "is_template": dash.is_template,
            "created_at": dash.created_at,
            "updated_at": dash.updated_at,
            "location_ids": location_ids,
        })

    return DashboardList(
        dashboards=[DashboardResponse(**d) for d in dashboards_data],
        total=total
    )


@router.post("/", response_model=DashboardResponse, status_code=status.HTTP_201_CREATED)
async def create_dashboard(
    dashboard_create: DashboardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new dashboard
    """
    # Create dashboard
    dashboard = Dashboard(
        organization_id=current_user.organization_id,
        name=dashboard_create.name,
        description=dashboard_create.description,
        config=dashboard_create.config,
        created_by=current_user.id,
        is_template=False,
    )
    db.add(dashboard)
    db.flush()

    # Associate locations if provided
    if dashboard_create.location_ids:
        # Verify user has access to these locations
        accessible_locations = db.query(Location.id).join(SquareAccount).filter(
            SquareAccount.organization_id == current_user.organization_id,
            Location.id.in_(dashboard_create.location_ids)
        ).all()
        accessible_location_ids = [str(loc.id) for loc in accessible_locations]

        for loc_id in dashboard_create.location_ids:
            if loc_id in accessible_location_ids:
                dash_loc = DashboardLocation(
                    dashboard_id=dashboard.id,
                    location_id=loc_id
                )
                db.add(dash_loc)

    db.commit()
    db.refresh(dashboard)

    # Get location IDs
    location_ids = [str(dl.location_id) for dl in dashboard.dashboard_locations]

    return DashboardResponse(
        id=str(dashboard.id),
        organization_id=str(dashboard.organization_id),
        name=dashboard.name,
        description=dashboard.description,
        config=dashboard.config,
        created_by=str(dashboard.created_by),
        is_template=dashboard.is_template,
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
        location_ids=location_ids,
    )


@router.get("/{dashboard_id}", response_model=DashboardResponse)
async def get_dashboard(
    dashboard_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get dashboard by ID
    """
    dashboard = db.query(Dashboard).filter(
        Dashboard.id == dashboard_id,
        Dashboard.organization_id == current_user.organization_id
    ).first()

    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found"
        )

    # Check permission
    if current_user.role not in ["admin", "superadmin"]:
        has_permission = db.query(UserDashboardPermission).filter(
            UserDashboardPermission.user_id == current_user.id,
            UserDashboardPermission.dashboard_id == dashboard_id
        ).first()

        if not has_permission and dashboard.created_by != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )

    # Get location IDs
    location_ids = [str(dl.location_id) for dl in dashboard.dashboard_locations]

    return DashboardResponse(
        id=str(dashboard.id),
        organization_id=str(dashboard.organization_id),
        name=dashboard.name,
        description=dashboard.description,
        config=dashboard.config,
        created_by=str(dashboard.created_by),
        is_template=dashboard.is_template,
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
        location_ids=location_ids,
    )


@router.patch("/{dashboard_id}", response_model=DashboardResponse)
async def update_dashboard(
    dashboard_id: str,
    dashboard_update: DashboardUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update dashboard
    """
    dashboard = db.query(Dashboard).filter(
        Dashboard.id == dashboard_id,
        Dashboard.organization_id == current_user.organization_id
    ).first()

    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found"
        )

    # Only creator or admin can update
    if current_user.role not in ["admin", "superadmin"] and dashboard.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    # Update fields
    if dashboard_update.name is not None:
        dashboard.name = dashboard_update.name
    if dashboard_update.description is not None:
        dashboard.description = dashboard_update.description
    if dashboard_update.config is not None:
        dashboard.config = dashboard_update.config

    # Update locations if provided
    if dashboard_update.location_ids is not None:
        # Remove existing locations
        db.query(DashboardLocation).filter(
            DashboardLocation.dashboard_id == dashboard_id
        ).delete()

        # Add new locations
        accessible_locations = db.query(Location.id).join(SquareAccount).filter(
            SquareAccount.organization_id == current_user.organization_id,
            Location.id.in_(dashboard_update.location_ids)
        ).all()
        accessible_location_ids = [str(loc.id) for loc in accessible_locations]

        for loc_id in dashboard_update.location_ids:
            if loc_id in accessible_location_ids:
                dash_loc = DashboardLocation(
                    dashboard_id=dashboard.id,
                    location_id=loc_id
                )
                db.add(dash_loc)

    db.commit()
    db.refresh(dashboard)

    # Get location IDs
    location_ids = [str(dl.location_id) for dl in dashboard.dashboard_locations]

    return DashboardResponse(
        id=str(dashboard.id),
        organization_id=str(dashboard.organization_id),
        name=dashboard.name,
        description=dashboard.description,
        config=dashboard.config,
        created_by=str(dashboard.created_by),
        is_template=dashboard.is_template,
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
        location_ids=location_ids,
    )


@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard(
    dashboard_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete dashboard
    """
    dashboard = db.query(Dashboard).filter(
        Dashboard.id == dashboard_id,
        Dashboard.organization_id == current_user.organization_id
    ).first()

    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found"
        )

    # Only creator or admin can delete
    if current_user.role not in ["admin", "superadmin"] and dashboard.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    db.delete(dashboard)
    db.commit()
