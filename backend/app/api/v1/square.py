"""
Square API Endpoints
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from datetime import datetime
import secrets
import json
import base64

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.models.square_account import SquareAccount
from app.models.location import Location
from app.models.data_import import DataImport, ImportType, ImportStatus as ImportStatusEnum
from app.models.catalog_category import CatalogItemCategory
from app.models.catalog_hierarchy import CatalogCategory, CatalogItemCategoryMembership
from app.services.square_service import square_service
from app.schemas.square import (
    SquareOAuthURL,
    SquareOAuthCallback,
    SquareAccountResponse,
    SquareAccountList,
    LocationResponse,
    LocationList,
    LocationUpdate,
    HistoricalImportRequest,
    ImportStatus,
    ImportStatusList,
    SyncRequest,
    SyncResponse,
    SyncStatusResponse,
)

router = APIRouter(prefix="/square", tags=["square"])


@router.get("/oauth/url", response_model=SquareOAuthURL)
async def get_oauth_url(
    current_user: User = Depends(require_role(["admin", "superadmin"]))
):
    """
    Get Square OAuth authorization URL
    Admin/Superadmin only
    """
    # Encode user info in state for callback
    state_data = {
        "user_id": str(current_user.id),
        "org_id": str(current_user.organization_id),
        "random": secrets.token_urlsafe(16)  # CSRF protection
    }
    state = base64.urlsafe_b64encode(json.dumps(state_data).encode()).decode()

    oauth_url = square_service.get_oauth_url(state)
    return SquareOAuthURL(url=oauth_url)


@router.get("/oauth/callback", response_class=HTMLResponse)
async def oauth_callback(
    code: str = Query(..., description="Authorization code from Square"),
    state: str = Query(..., description="State parameter for CSRF protection"),
    db: Session = Depends(get_db),
):
    """
    Handle Square OAuth callback
    Exchange code for tokens and create Square account

    Returns HTML that redirects back to the frontend with success/error status
    """
    frontend_origin = settings.CORS_ORIGINS[0] if settings.CORS_ORIGINS else "*"

    try:
        # Decode state to get user info
        state_data = json.loads(base64.urlsafe_b64decode(state.encode()).decode())
        org_id = state_data["org_id"]
        user_id = state_data["user_id"]

        # Exchange authorization code for tokens
        token_response = await square_service.exchange_code_for_token(code)

        access_token = token_response["access_token"]
        refresh_token = token_response["refresh_token"]
        expires_at = datetime.fromisoformat(token_response["expires_at"].replace("Z", "+00:00"))
        merchant_id = token_response["merchant_id"]

        # Get merchant information
        merchant_info = await square_service.get_merchant_info(access_token)
        merchant_name = merchant_info.get("business_name", "Unknown")
        currency = merchant_info.get("currency", "USD")

        # Create Square account
        square_account = square_service.create_square_account(
            db=db,
            organization_id=org_id,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at,
            merchant_id=merchant_id,
            merchant_name=merchant_name,
            currency=currency,
        )

        # Sync locations immediately
        await square_service.sync_locations(db, square_account)

        # Return HTML that redirects to frontend with success
        return HTMLResponse(content=f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Square Connected</title>
            <script>
                window.opener.postMessage({{ type: 'square-oauth-success', accountId: '{square_account.id}' }}, '{frontend_origin}');
                window.close();
            </script>
        </head>
        <body>
            <h1>Success!</h1>
            <p>Square account connected successfully. This window will close automatically...</p>
            <p>If it doesn't close, <a href="{frontend_origin}/square-accounts">click here</a>.</p>
        </body>
        </html>
        """)

    except Exception as e:
        # Return HTML that redirects to frontend with error
        error_message = str(e).replace("'", "\\'").replace("<", "&lt;").replace(">", "&gt;")
        return HTMLResponse(content=f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Connection Failed</title>
            <script>
                window.opener.postMessage({{ type: 'square-oauth-error', error: '{error_message}' }}, '{frontend_origin}');
                setTimeout(() => window.close(), 3000);
            </script>
        </head>
        <body>
            <h1>Connection Failed</h1>
            <p>Error: {error_message}</p>
            <p>This window will close automatically...</p>
            <p>If it doesn't close, <a href="{frontend_origin}/square-accounts">click here</a>.</p>
        </body>
        </html>
        """, status_code=400)


@router.get("/accounts", response_model=SquareAccountList)
async def list_square_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    """
    List all Square accounts for the organization
    """
    query = db.query(SquareAccount).filter(
        SquareAccount.organization_id == current_user.organization_id
    )

    total = query.count()
    accounts = query.offset(skip).limit(limit).all()

    # Convert accounts to dict and ensure UUIDs are strings
    accounts_data = []
    for acc in accounts:
        accounts_data.append({
            "id": str(acc.id),
            "organization_id": str(acc.organization_id),
            "square_merchant_id": acc.square_merchant_id,
            "account_name": acc.account_name,
            "base_currency": acc.base_currency,
            "is_active": acc.is_active,
            "last_sync_at": acc.last_sync_at,
            "created_at": acc.created_at,
        })

    return SquareAccountList(
        accounts=[SquareAccountResponse(**acc_data) for acc_data in accounts_data],
        total=total
    )


@router.get("/accounts/{account_id}", response_model=SquareAccountResponse)
async def get_square_account(
    account_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get Square account by ID
    """
    account = db.query(SquareAccount).filter(
        SquareAccount.id == account_id,
        SquareAccount.organization_id == current_user.organization_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Square account not found"
        )

    return SquareAccountResponse.model_validate(account)


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_square_account(
    account_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"]))
):
    """
    Disconnect Square account (soft delete - set is_active to False)
    Admin/Superadmin only
    """
    account = db.query(SquareAccount).filter(
        SquareAccount.id == account_id,
        SquareAccount.organization_id == current_user.organization_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Square account not found"
        )

    account.is_active = False
    db.commit()
    return None


@router.get("/accounts/{account_id}/locations", response_model=LocationList)
async def list_locations(
    account_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    """
    List all locations for a Square account
    """
    # Verify account belongs to organization
    account = db.query(SquareAccount).filter(
        SquareAccount.id == account_id,
        SquareAccount.organization_id == current_user.organization_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Square account not found"
        )

    query = db.query(Location).filter(Location.square_account_id == account_id)

    total = query.count()
    locations = query.offset(skip).limit(limit).all()

    # Convert locations to dict and ensure UUIDs are strings
    locations_data = []
    for loc in locations:
        locations_data.append({
            "id": str(loc.id),
            "square_account_id": str(loc.square_account_id),
            "square_location_id": loc.square_location_id,
            "name": loc.name,
            "address": loc.address,
            "currency": loc.currency,
            "timezone": loc.timezone,
            "is_active": loc.is_active,
            "location_metadata": loc.location_metadata,
        })

    return LocationList(
        locations=[LocationResponse(**loc_data) for loc_data in locations_data],
        total=total
    )


@router.patch("/locations/{location_id}", response_model=LocationResponse)
async def update_location(
    location_id: str,
    location_update: LocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"]))
):
    """
    Update location (toggle active status for syncing)
    Admin/Superadmin only
    """
    # Get location and verify it belongs to user's organization
    location = db.query(Location).join(SquareAccount).filter(
        Location.id == location_id,
        SquareAccount.organization_id == current_user.organization_id
    ).first()

    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found"
        )

    location.is_active = location_update.is_active
    db.commit()
    db.refresh(location)

    return LocationResponse.model_validate(location)


@router.post("/accounts/{account_id}/sync-locations", response_model=LocationList)
async def sync_locations(
    account_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"]))
):
    """
    Sync locations from Square API to database
    Admin/Superadmin only
    """
    account = db.query(SquareAccount).filter(
        SquareAccount.id == account_id,
        SquareAccount.organization_id == current_user.organization_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Square account not found"
        )

    try:
        synced_locations = await square_service.sync_locations(db, account)

        return LocationList(
            locations=[LocationResponse.model_validate(loc) for loc in synced_locations],
            total=len(synced_locations)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync locations: {str(e)}"
        )


@router.post("/import/historical", response_model=ImportStatus)
async def start_historical_import(
    import_request: HistoricalImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"]))
):
    """
    Start historical data import for Square account
    Admin/Superadmin only
    """
    # Verify account belongs to organization
    account = db.query(SquareAccount).filter(
        SquareAccount.id == import_request.square_account_id,
        SquareAccount.organization_id == current_user.organization_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Square account not found"
        )

    # Create import record
    data_import = DataImport(
        square_account_id=import_request.square_account_id,
        import_type=ImportType.HISTORICAL,
        start_date=import_request.start_date.date(),
        end_date=import_request.end_date.date(),
        status=ImportStatusEnum.PENDING,
        initiated_by=current_user.id,
    )

    db.add(data_import)
    db.commit()
    db.refresh(data_import)

    # Trigger background import task
    from app.tasks.sync_square_data import import_square_orders_task
    import_square_orders_task.delay(str(data_import.id))

    # Convert to dict with string UUIDs
    import_data = {
        "id": str(data_import.id),
        "square_account_id": str(data_import.square_account_id),
        "location_id": str(data_import.location_id) if data_import.location_id else None,
        "import_type": data_import.import_type.value,
        "start_date": data_import.start_date,
        "end_date": data_import.end_date,
        "status": data_import.status.value,
        "total_transactions": data_import.total_transactions,
        "imported_transactions": data_import.imported_transactions,
        "duplicate_transactions": data_import.duplicate_transactions,
        "error_message": data_import.error_message,
        "started_at": data_import.started_at,
        "completed_at": data_import.completed_at,
        "created_at": data_import.created_at,
    }

    return ImportStatus(**import_data)


@router.get("/imports", response_model=ImportStatusList)
async def list_imports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    square_account_id: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    """
    List import jobs for the organization
    """
    # Get all Square accounts for the organization
    account_ids = db.query(SquareAccount.id).filter(
        SquareAccount.organization_id == current_user.organization_id
    ).all()
    account_ids = [str(aid[0]) for aid in account_ids]

    query = db.query(DataImport).filter(
        DataImport.square_account_id.in_(account_ids)
    )

    if square_account_id:
        query = query.filter(DataImport.square_account_id == square_account_id)

    query = query.order_by(DataImport.created_at.desc())

    total = query.count()
    imports = query.offset(skip).limit(limit).all()

    return ImportStatusList(
        imports=[ImportStatus.model_validate(imp) for imp in imports],
        total=total
    )


@router.get("/imports/{import_id}", response_model=ImportStatus)
async def get_import_status(
    import_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get import job status
    """
    data_import = db.query(DataImport).join(SquareAccount).filter(
        DataImport.id == import_id,
        SquareAccount.organization_id == current_user.organization_id
    ).first()

    if not data_import:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import not found"
        )

    return ImportStatus.model_validate(data_import)


@router.post("/imports/{import_id}/reset", response_model=ImportStatus)
async def reset_stuck_import(
    import_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"])),
):
    """
    Reset a stuck import (IN_PROGRESS → FAILED) so it can be re-triggered.
    Admin/Superadmin only.
    """
    data_import = db.query(DataImport).join(SquareAccount).filter(
        DataImport.id == import_id,
        SquareAccount.organization_id == current_user.organization_id,
    ).first()

    if not data_import:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import not found",
        )

    if data_import.status not in (ImportStatusEnum.IN_PROGRESS, ImportStatusEnum.PENDING):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Import is not stuck — current status is {data_import.status.value}",
        )

    data_import.status = ImportStatusEnum.FAILED
    data_import.error_message = "Manually reset by admin. Data imported so far has been saved."
    data_import.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(data_import)

    return ImportStatus(
        id=str(data_import.id),
        square_account_id=str(data_import.square_account_id),
        location_id=str(data_import.location_id) if data_import.location_id else None,
        import_type=data_import.import_type.value if hasattr(data_import.import_type, 'value') else data_import.import_type,
        start_date=data_import.start_date,
        end_date=data_import.end_date,
        status=data_import.status.value if hasattr(data_import.status, 'value') else data_import.status,
        total_transactions=data_import.total_transactions,
        imported_transactions=data_import.imported_transactions,
        duplicate_transactions=data_import.duplicate_transactions,
        error_message=data_import.error_message,
        started_at=data_import.started_at,
        completed_at=data_import.completed_at,
        created_at=data_import.created_at,
    )


@router.post("/sync", response_model=SyncResponse)
async def trigger_manual_sync(
    sync_request: SyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"]))
):
    """
    Trigger manual sync of Square data
    Admin/Superadmin only
    """
    # Verify account belongs to organization
    account = db.query(SquareAccount).filter(
        SquareAccount.id == sync_request.square_account_id,
        SquareAccount.organization_id == current_user.organization_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Square account not found"
        )

    # Get locations to sync
    query = db.query(Location).filter(
        Location.square_account_id == sync_request.square_account_id,
        Location.is_active == True
    )

    if sync_request.location_ids:
        query = query.filter(Location.id.in_(sync_request.location_ids))

    locations = query.all()

    if not locations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active locations to sync"
        )

    # Create a DataImport record so it shows in Sync Status
    data_import = DataImport(
        square_account_id=account.id,
        import_type=ImportType.MANUAL_SYNC,
        start_date=datetime.utcnow().date(),
        end_date=datetime.utcnow().date(),
        status=ImportStatusEnum.IN_PROGRESS,
        initiated_by=current_user.id,
        started_at=datetime.utcnow(),
    )
    db.add(data_import)
    db.commit()
    db.refresh(data_import)

    from app.tasks.sync_square_data import sync_square_payments
    task = sync_square_payments.delay(
        str(account.id),
        [str(loc.id) for loc in locations],
        str(data_import.id),
    )

    return SyncResponse(
        message=f"Sync started for {len(locations)} locations",
        task_id=task.id,
        locations_synced=len(locations)
    )


@router.get("/accounts/{account_id}/sync-status", response_model=SyncStatusResponse)
async def get_sync_status(
    account_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get sync status for a Square account
    """
    account = db.query(SquareAccount).filter(
        SquareAccount.id == account_id,
        SquareAccount.organization_id == current_user.organization_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Square account not found"
        )

    # Get location counts
    total_locations = db.query(Location).filter(
        Location.square_account_id == account_id
    ).count()

    active_locations = db.query(Location).filter(
        Location.square_account_id == account_id,
        Location.is_active == True
    ).count()

    # Get recent imports
    recent_imports = db.query(DataImport).filter(
        DataImport.square_account_id == account_id
    ).order_by(DataImport.created_at.desc()).limit(5).all()

    # Convert imports to dict with UUID strings
    imports_data = []
    for imp in recent_imports:
        imports_data.append({
            "id": str(imp.id),
            "square_account_id": str(imp.square_account_id),
            "location_id": str(imp.location_id) if imp.location_id else None,
            "import_type": imp.import_type,
            "start_date": imp.start_date,
            "end_date": imp.end_date,
            "status": imp.status,
            "total_transactions": imp.total_transactions,
            "imported_transactions": imp.imported_transactions,
            "duplicate_transactions": imp.duplicate_transactions,
            "error_message": imp.error_message,
            "started_at": imp.started_at,
            "completed_at": imp.completed_at,
            "created_at": imp.created_at,
        })

    return SyncStatusResponse(
        square_account_id=str(account.id),
        account_name=account.account_name,
        last_sync_at=account.last_sync_at,
        active_locations=active_locations,
        total_locations=total_locations,
        recent_imports=[ImportStatus(**imp_data) for imp_data in imports_data]
    )


@router.post("/accounts/{account_id}/sync-catalog")
async def sync_catalog_categories(
    account_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"])),
):
    """
    Sync catalog item → reporting category mappings from Square.
    Fetches ITEM and CATEGORY objects, maps each variation to its reporting category.
    """
    account = db.query(SquareAccount).filter(
        SquareAccount.id == account_id,
        SquareAccount.organization_id == current_user.organization_id,
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Square account not found")

    access_token = square_service.get_decrypted_token(account)

    # Step 1: Fetch all CATEGORY objects — build hierarchy and persist
    category_map: dict[str, str] = {}  # id → name
    category_hierarchy: dict[str, dict] = {}  # id → {name, parent_id, is_top_level, path_to_root}
    cursor = None
    while True:
        resp = await square_service.list_catalog(access_token, types="CATEGORY", cursor=cursor)
        for obj in resp.get("objects", []):
            cat_id = obj.get("id")
            cat_data = obj.get("category_data", {})
            cat_name = cat_data.get("name", "Uncategorized")
            if not cat_id:
                continue

            category_map[cat_id] = cat_name

            # Extract hierarchy info
            parent_cat = cat_data.get("parent_category", {})
            parent_id = parent_cat.get("id") if isinstance(parent_cat, dict) else None
            is_top = cat_data.get("is_top_level", False)
            path_to_root = cat_data.get("path_to_root", {})
            # path_to_root from Square: {"categories": [{"id": "...", "name": "..."}, ...]}
            path_list = path_to_root.get("categories", []) if isinstance(path_to_root, dict) else []

            category_hierarchy[cat_id] = {
                "name": cat_name,
                "parent_id": parent_id,
                "is_top_level": is_top,
                "path_to_root": path_list,
            }

            # Upsert into catalog_categories table
            existing_cat = db.query(CatalogCategory).filter(
                CatalogCategory.square_account_id == account.id,
                CatalogCategory.square_category_id == cat_id,
            ).first()

            if existing_cat:
                existing_cat.name = cat_name
                existing_cat.parent_category_id = parent_id
                existing_cat.is_top_level = is_top
                existing_cat.path_to_root = path_list
            else:
                db.add(CatalogCategory(
                    square_account_id=account.id,
                    square_category_id=cat_id,
                    name=cat_name,
                    parent_category_id=parent_id,
                    is_top_level=is_top,
                    path_to_root=path_list,
                ))

        cursor = resp.get("cursor")
        if not cursor:
            break

    # Clear old memberships for this account (full replace per sync)
    db.query(CatalogItemCategoryMembership).filter(
        CatalogItemCategoryMembership.square_account_id == account.id,
    ).delete()

    # Helper: extract artist name from category hierarchy
    def _extract_artist(cat_id: str) -> Optional[str]:
        """Walk the path_to_root to find the depth-1 (artist) category.
        path_to_root is ordered from root to self, so:
          [0] = top-level (client), [1] = artist, [2] = sub-cat, etc.
        The artist is at index 1 if the path has >= 2 entries.
        """
        info = category_hierarchy.get(cat_id)
        if not info:
            return None
        path = info.get("path_to_root", [])
        # path includes the category itself, ordered root→self
        # If path has >= 2 elements, index 1 is the artist level
        if len(path) >= 2:
            return path[1].get("name")
        return None

    # Step 2: Fetch all ITEM objects — map variations to reporting category + all categories
    items_processed = 0
    variations_processed = 0
    memberships_created = 0
    cursor = None
    while True:
        resp = await square_service.list_catalog(access_token, types="ITEM", cursor=cursor)
        for obj in resp.get("objects", []):
            item_data = obj.get("item_data", {})
            item_id = obj.get("id")
            item_name = item_data.get("name", "Unknown")

            # Get reporting category
            reporting_cat = item_data.get("reporting_category", {})
            reporting_cat_id = reporting_cat.get("id") if isinstance(reporting_cat, dict) else None
            category_name = category_map.get(reporting_cat_id, "Uncategorized") if reporting_cat_id else "Uncategorized"

            # Also check category_id field (older Square API format)
            if category_name == "Uncategorized":
                cat_id_legacy = item_data.get("category_id")
                if cat_id_legacy and cat_id_legacy in category_map:
                    category_name = category_map[cat_id_legacy]

            # Get ALL categories this item belongs to
            item_categories = item_data.get("categories", [])
            # item_categories is a list of {"id": "cat_id"} dicts
            all_cat_ids = set()
            for cat_ref in item_categories:
                cid = cat_ref.get("id") if isinstance(cat_ref, dict) else None
                if cid:
                    all_cat_ids.add(cid)

            # Extract artist name from any category in the hierarchy
            artist_name = None
            for cid in all_cat_ids:
                artist_name = _extract_artist(cid)
                if artist_name:
                    break

            items_processed += 1

            # Map each variation
            for variation in item_data.get("variations", []):
                var_id = variation.get("id")
                var_name = variation.get("item_variation_data", {}).get("name", "Standard")
                if not var_id:
                    continue

                # Upsert reporting category mapping
                existing = db.query(CatalogItemCategory).filter(
                    CatalogItemCategory.square_account_id == account.id,
                    CatalogItemCategory.catalog_object_id == var_id,
                ).first()

                if existing:
                    existing.item_id = item_id
                    existing.item_name = item_name
                    existing.variation_name = var_name
                    existing.category_id = reporting_cat_id
                    existing.category_name = category_name
                    existing.artist_name = artist_name
                else:
                    db.add(CatalogItemCategory(
                        square_account_id=account.id,
                        catalog_object_id=var_id,
                        item_id=item_id,
                        item_name=item_name,
                        variation_name=var_name,
                        category_id=reporting_cat_id,
                        category_name=category_name,
                        artist_name=artist_name,
                    ))
                variations_processed += 1

                # Insert category memberships (all categories, not just reporting)
                for cid in all_cat_ids:
                    db.add(CatalogItemCategoryMembership(
                        square_account_id=account.id,
                        catalog_object_id=var_id,
                        item_id=item_id,
                        category_id=cid,
                    ))
                    memberships_created += 1

        cursor = resp.get("cursor")
        if not cursor:
            break

    db.commit()

    # Recompute client→product mappings for all clients in this org with keywords
    from app.services.client_catalog_service import recompute_client_mappings
    client_mappings = recompute_client_mappings(db, organization_id=str(account.organization_id))

    return {
        "message": "Catalog sync completed",
        "categories_found": len(category_map),
        "items_processed": items_processed,
        "variations_mapped": variations_processed,
        "category_memberships_created": memberships_created,
        "client_product_mappings": client_mappings,
    }
