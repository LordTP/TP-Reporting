"""
Budget API Endpoints
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, and_, or_
from datetime import date, datetime, timedelta
import math
import csv
import io
import uuid as uuid_lib

from app.database import get_db
from app.dependencies import require_permission
from app.models.user import User
from app.models.budget import Budget, BudgetType
from app.models.location import Location
from app.models.square_account import SquareAccount
from app.models.sales_transaction import SalesTransaction
from app.models.daily_sales_summary import DailySalesSummary
from app.services.exchange_rate_service import exchange_rate_service
from app.schemas.budget import (
    BudgetCreate,
    BudgetUpdate,
    BudgetResponse,
    BudgetListResponse,
    BudgetPerformance,
    BudgetPerformanceReport,
    BudgetUploadResponse,
)

router = APIRouter(tags=["budgets"])


def get_accessible_locations(db: Session, user: User) -> list[str]:
    """Get list of location IDs user has access to, scoped by role and client assignment."""
    from app.models.client import Client, user_clients, client_locations

    if user.role in ("superadmin", "admin"):
        locations = db.query(Location.id).join(SquareAccount).filter(
            SquareAccount.organization_id == user.organization_id
        ).all()
        return [str(loc.id) for loc in locations]

    # Non-admin roles: scope to locations of assigned clients
    assigned_client_ids = [
        r[0] for r in db.query(user_clients.c.client_id).filter(
            user_clients.c.user_id == user.id
        ).all()
    ]
    if not assigned_client_ids and user.client_id:
        assigned_client_ids = [user.client_id]

    if not assigned_client_ids:
        return []

    location_ids = [
        str(r[0]) for r in db.query(client_locations.c.location_id).filter(
            client_locations.c.client_id.in_(assigned_client_ids)
        ).all()
    ]
    return location_ids


@router.post("/", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED)
async def create_budget(
    budget: BudgetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("feature:manage_budgets")),
):
    """
    Create a new budget
    """
    # Check user has access to this location
    accessible_locations = get_accessible_locations(db, current_user)
    if budget.location_id not in accessible_locations:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this location"
        )

    # Check if budget already exists for this location, date, and type
    existing = db.query(Budget).filter(
        Budget.location_id == budget.location_id,
        Budget.date == budget.date,
        Budget.budget_type == budget.budget_type
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Budget already exists for this location, date, and type"
        )

    # Create budget
    db_budget = Budget(
        id=uuid_lib.uuid4(),
        location_id=uuid_lib.UUID(budget.location_id),
        date=budget.date,
        budget_amount=budget.budget_amount,
        currency=budget.currency,
        budget_type=budget.budget_type,
        notes=budget.notes,
        created_by=current_user.id,
    )

    db.add(db_budget)
    db.commit()
    db.refresh(db_budget)

    return BudgetResponse(
        id=str(db_budget.id),
        location_id=str(db_budget.location_id),
        date=db_budget.date,
        budget_amount=db_budget.budget_amount,
        currency=db_budget.currency,
        budget_type=db_budget.budget_type,
        notes=db_budget.notes,
        created_by=str(db_budget.created_by),
        created_at=db_budget.created_at,
        updated_at=db_budget.updated_at,
    )


@router.get("/", response_model=BudgetListResponse)
async def list_budgets(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("page:budgets")),
    location_ids: Optional[str] = Query(None, description="Comma-separated location IDs"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    budget_type: Optional[BudgetType] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1000),
):
    """
    List budgets with filtering and pagination
    """
    # Get user's accessible locations
    accessible_location_ids = get_accessible_locations(db, current_user)

    # Build query
    query = db.query(Budget).filter(
        Budget.location_id.in_([uuid_lib.UUID(lid) for lid in accessible_location_ids])
    )

    # Apply filters
    if location_ids:
        requested_ids = [lid.strip() for lid in location_ids.split(',')]
        filtered_ids = [lid for lid in requested_ids if lid in accessible_location_ids]
        if filtered_ids:
            query = query.filter(Budget.location_id.in_([uuid_lib.UUID(lid) for lid in filtered_ids]))

    if start_date:
        query = query.filter(Budget.date >= start_date)

    if end_date:
        query = query.filter(Budget.date <= end_date)

    if budget_type:
        query = query.filter(Budget.budget_type == budget_type)

    # Get total count
    total = query.count()

    # Apply sorting
    query = query.order_by(desc(Budget.date))

    # Apply pagination
    offset = (page - 1) * page_size
    budgets = query.offset(offset).limit(page_size).all()

    return BudgetListResponse(
        budgets=[
            BudgetResponse(
                id=str(b.id),
                location_id=str(b.location_id),
                date=b.date,
                budget_amount=b.budget_amount,
                currency=b.currency,
                budget_type=b.budget_type,
                notes=b.notes,
                created_by=str(b.created_by),
                created_at=b.created_at,
                updated_at=b.updated_at,
            )
            for b in budgets
        ],
        total=total
    )


@router.post("/upload-csv", response_model=BudgetUploadResponse)
async def upload_budget_csv(
    file: UploadFile = File(...),
    currency: str = Query("GBP", description="Currency code"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("feature:manage_budgets")),
):
    """
    Upload budgets via CSV in grid format.
    First column is 'date' (YYYY-MM-DD), remaining columns are location names.
    Values are in pounds (converted to pence internally).
    Existing budgets for the same location+date are updated.
    """
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 5 MB.")
    try:
        text = content.decode("utf-8-sig")  # handles BOM from Excel
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no headers")

    # Normalise headers
    headers = [h.strip() for h in reader.fieldnames]
    if headers[0].lower() != "date":
        raise HTTPException(status_code=400, detail="First column must be 'date'")

    location_columns = headers[1:]
    if not location_columns:
        raise HTTPException(status_code=400, detail="CSV must have at least one location column")

    # Build location name → id lookup (org-scoped, case-insensitive)
    org_account_ids = [
        r[0] for r in db.query(SquareAccount.id).filter(
            SquareAccount.organization_id == current_user.organization_id
        ).all()
    ]
    org_locations = db.query(Location).filter(
        Location.square_account_id.in_(org_account_ids)
    ).all()

    loc_lookup: dict[str, Location] = {}
    for loc in org_locations:
        loc_lookup[loc.name.strip().lower()] = loc

    # Match CSV columns to locations
    matched: dict[str, Location] = {}
    unmatched: list[str] = []
    for col in location_columns:
        loc = loc_lookup.get(col.strip().lower())
        if loc:
            matched[col] = loc
        else:
            unmatched.append(col)

    rows_processed = 0
    created = 0
    updated = 0

    for row in reader:
        date_str = row.get(headers[0], "").strip()
        if not date_str:
            continue

        try:
            budget_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            # Try alternative formats
            try:
                budget_date = datetime.strptime(date_str, "%d/%m/%Y").date()
            except ValueError:
                continue  # skip unparseable rows

        rows_processed += 1

        for col, loc in matched.items():
            raw_val = row.get(col, "").strip()
            if not raw_val:
                continue

            try:
                amount_pounds = float(raw_val.replace(",", ""))
                amount_pence = round(amount_pounds * 100)
            except ValueError:
                continue

            if amount_pence <= 0:
                continue

            # Upsert
            existing = db.query(Budget).filter(
                Budget.location_id == loc.id,
                Budget.date == budget_date,
                Budget.budget_type == BudgetType.DAILY,
            ).first()

            if existing:
                existing.budget_amount = amount_pence
                existing.currency = currency
                updated += 1
            else:
                db.add(Budget(
                    id=uuid_lib.uuid4(),
                    location_id=loc.id,
                    date=budget_date,
                    budget_amount=amount_pence,
                    currency=currency,
                    budget_type=BudgetType.DAILY,
                    created_by=current_user.id,
                ))
                created += 1

    db.commit()

    return BudgetUploadResponse(
        message=f"Budget upload complete. {created} created, {updated} updated.",
        rows_processed=rows_processed,
        budgets_created=created,
        budgets_updated=updated,
        unmatched_locations=unmatched,
    )


@router.get("/coverage")
async def get_budget_coverage(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("page:budgets")),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
):
    """
    Returns per-location coverage: days with sales but no budget entry.
    Defaults to the last 30 days if no dates provided.
    """
    from datetime import timedelta

    if not end_date:
        end_date = date.today() - timedelta(days=1)
    if not start_date:
        start_date = end_date - timedelta(days=29)

    accessible_location_ids = get_accessible_locations(db, current_user)
    if not accessible_location_ids:
        return {"locations": [], "start_date": str(start_date), "end_date": str(end_date)}

    loc_uuids = [uuid_lib.UUID(lid) for lid in accessible_location_ids]

    # Days with sales per location (transaction_count > 0)
    sales_days = db.query(
        DailySalesSummary.location_id,
        DailySalesSummary.date,
    ).filter(
        DailySalesSummary.location_id.in_(loc_uuids),
        DailySalesSummary.date >= start_date,
        DailySalesSummary.date <= end_date,
        DailySalesSummary.transaction_count > 0,
    ).all()

    # Days with budget entries per location
    budget_days = db.query(
        Budget.location_id,
        Budget.date,
    ).filter(
        Budget.location_id.in_(loc_uuids),
        Budget.date >= start_date,
        Budget.date <= end_date,
    ).all()

    budget_set = {(str(r.location_id), r.date) for r in budget_days}

    # Group missing days by location
    missing_by_loc: dict[str, list] = {}
    sales_by_loc: dict[str, int] = {}
    for row in sales_days:
        loc_id = str(row.location_id)
        sales_by_loc[loc_id] = sales_by_loc.get(loc_id, 0) + 1
        if (loc_id, row.date) not in budget_set:
            missing_by_loc.setdefault(loc_id, []).append(str(row.date))

    # Get location names
    loc_ids_needed = set(sales_by_loc.keys())
    loc_names = {}
    if loc_ids_needed:
        locs = db.query(Location).filter(Location.id.in_([uuid_lib.UUID(lid) for lid in loc_ids_needed])).all()
        loc_names = {str(loc.id): loc.name for loc in locs}

    results = []
    for loc_id in sorted(loc_ids_needed, key=lambda x: loc_names.get(x, "")):
        missing = sorted(missing_by_loc.get(loc_id, []))
        results.append({
            "location_id": loc_id,
            "location_name": loc_names.get(loc_id, "Unknown"),
            "sales_days": sales_by_loc.get(loc_id, 0),
            "budget_days": sales_by_loc.get(loc_id, 0) - len(missing),
            "missing_days": missing,
        })

    return {
        "locations": results,
        "start_date": str(start_date),
        "end_date": str(end_date),
    }


@router.get("/locations", response_model=list[dict])
async def get_budget_locations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("page:budgets")),
):
    """Get location names for the current user's org (for CSV template generation)."""
    org_account_ids = [
        r[0] for r in db.query(SquareAccount.id).filter(
            SquareAccount.organization_id == current_user.organization_id
        ).all()
    ]
    locations = db.query(Location).filter(
        Location.square_account_id.in_(org_account_ids),
        Location.is_active == True,
    ).order_by(Location.name).all()

    return [{"id": str(loc.id), "name": loc.name, "currency": loc.currency} for loc in locations]


@router.get("/performance/report", response_model=BudgetPerformanceReport)
async def get_budget_performance(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("report:budget_vs_actual")),
    location_ids: Optional[str] = Query(None, description="Comma-separated location IDs"),
    client_id: Optional[str] = Query(None, description="Filter by client ID"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    date_preset: Optional[str] = Query(None, description="today, this_week, this_month, this_year"),
):
    """
    Get budget performance report for locations
    Shows budget vs actual sales with variance calculations
    """
    # Calculate date range from preset if provided
    if date_preset:
        from app.api.v1.sales import calculate_date_range_from_preset
        start_dt, end_dt = calculate_date_range_from_preset(date_preset)
        start_date_d = start_dt.date()
        end_date_d = end_dt.date()
    else:
        start_date_d: Optional[date] = date.fromisoformat(start_date) if start_date else None
        end_date_d: Optional[date] = date.fromisoformat(end_date) if end_date else None

    # Get accessible locations
    accessible_location_ids = get_accessible_locations(db, current_user)

    # Filter by client if specified
    if client_id:
        from app.models.client import Client
        client = db.query(Client).filter(Client.id == uuid_lib.UUID(client_id)).first()
        if client:
            client_location_ids = [str(loc.id) for loc in client.locations]
            accessible_location_ids = [lid for lid in accessible_location_ids if lid in client_location_ids]

    # Further filter by requested locations
    if location_ids:
        requested_ids = [lid.strip() for lid in location_ids.split(',')]
        accessible_location_ids = [lid for lid in accessible_location_ids if lid in requested_ids]

    if not accessible_location_ids:
        return BudgetPerformanceReport(performances=[], summary={})

    # Query budgets and sales for the date range
    budget_query = db.query(
        Budget.location_id,
        Budget.date,
        func.sum(Budget.budget_amount).label("total_budget"),
        Budget.currency
    ).filter(
        Budget.location_id.in_([uuid_lib.UUID(lid) for lid in accessible_location_ids])
    )

    if start_date_d:
        budget_query = budget_query.filter(Budget.date >= start_date_d)
    if end_date_d:
        budget_query = budget_query.filter(Budget.date <= end_date_d)

    budget_query = budget_query.group_by(Budget.location_id, Budget.date, Budget.currency)
    budgets_data = budget_query.all()

    # Query actual sales from pre-aggregated daily summary (net = gross - tax - refunds)
    sales_query = db.query(
        DailySalesSummary.location_id,
        DailySalesSummary.date,
        DailySalesSummary.total_sales,
        DailySalesSummary.total_tax,
        DailySalesSummary.total_refund_amount,
        DailySalesSummary.currency,
    ).filter(
        DailySalesSummary.location_id.in_([uuid_lib.UUID(lid) for lid in accessible_location_ids])
    )

    if start_date_d:
        sales_query = sales_query.filter(DailySalesSummary.date >= start_date_d)
    if end_date_d:
        sales_query = sales_query.filter(DailySalesSummary.date <= end_date_d)

    sales_data = sales_query.all()

    # Create lookup for sales by location and date (net sales = gross - tax - refunds)
    sales_lookup = {}
    for sale in sales_data:
        key = (str(sale.location_id), sale.date)
        net_sales = (sale.total_sales or 0) - (sale.total_tax or 0) - (sale.total_refund_amount or 0)
        prev = sales_lookup.get(key)
        if prev:
            sales_lookup[key] = (prev[0] + net_sales, prev[1])
        else:
            sales_lookup[key] = (net_sales, sale.currency)

    # Get location names
    locations = db.query(Location).filter(
        Location.id.in_([uuid_lib.UUID(lid) for lid in accessible_location_ids])
    ).all()
    location_names = {str(loc.id): loc.name for loc in locations}

    # --- Exchange rates: convert all amounts to GBP ---
    all_currencies = set()
    for b in budgets_data:
        all_currencies.add(b.currency)
    for s in sales_data:
        if hasattr(s, 'currency') and s.currency:
            all_currencies.add(s.currency)
    rates_to_gbp, rates_live = exchange_rate_service.get_rates_to_gbp(db, current_user.organization_id, all_currencies)

    # Calculate performance metrics
    performances = []
    total_budget = 0
    total_sales = 0
    budget_by_currency = {}
    sales_by_currency = {}

    for budget_data in budgets_data:
        location_id = str(budget_data.location_id)
        sales_entry = sales_lookup.get((location_id, budget_data.date))
        actual_sales = sales_entry[0] if sales_entry else 0
        sales_currency = sales_entry[1] if sales_entry else budget_data.currency

        # Convert both to GBP — budget and sales may be in different currencies
        budget_rate = rates_to_gbp.get(budget_data.currency, 1.0)
        sales_rate = rates_to_gbp.get(sales_currency, 1.0)
        converted_budget = round(int(budget_data.total_budget) * budget_rate)
        converted_sales = round(int(actual_sales) * sales_rate)

        variance = converted_sales - converted_budget
        variance_percentage = (variance / converted_budget * 100) if converted_budget > 0 else 0.0
        attainment_percentage = (converted_sales / converted_budget * 100) if converted_budget > 0 else 0.0

        # Determine status
        if attainment_percentage >= 100:
            status_val = "exceeded"
        elif attainment_percentage >= 90:
            status_val = "on_track"
        else:
            status_val = "below_target"

        performances.append(BudgetPerformance(
            location_id=location_id,
            location_name=location_names.get(location_id, "Unknown"),
            date=budget_data.date,
            budget_amount=converted_budget,
            actual_sales=converted_sales,
            variance=variance,
            variance_percentage=round(variance_percentage, 2),
            attainment_percentage=round(attainment_percentage, 2),
            currency="GBP",
            status=status_val
        ))

        total_budget += converted_budget
        total_sales += converted_sales

        # Track per-currency breakdown
        bcurr = budget_data.currency
        if bcurr not in budget_by_currency:
            budget_by_currency[bcurr] = {"currency": bcurr, "amount": 0, "converted_amount": 0, "rate": round(budget_rate, 6)}
        budget_by_currency[bcurr]["amount"] += int(budget_data.total_budget)
        budget_by_currency[bcurr]["converted_amount"] += converted_budget

        scurr = sales_currency
        if scurr not in sales_by_currency:
            sales_by_currency[scurr] = {"currency": scurr, "amount": 0, "converted_amount": 0, "rate": round(sales_rate, 6)}
        sales_by_currency[scurr]["amount"] += int(actual_sales)
        sales_by_currency[scurr]["converted_amount"] += converted_sales

    # Calculate summary (all in GBP)
    overall_variance = total_sales - total_budget
    overall_attainment = (total_sales / total_budget * 100) if total_budget > 0 else 0
    locations_on_target = sum(1 for p in performances if p.attainment_percentage >= 90)

    exchange_rates_resp = {k: round(v, 6) for k, v in rates_to_gbp.items() if k != "GBP"}

    summary = {
        "total_budget": int(total_budget),
        "total_sales": int(total_sales),
        "overall_variance": int(overall_variance),
        "overall_attainment_percentage": float(round(overall_attainment, 2)),
        "locations_on_target": locations_on_target,
        "total_locations": len(set(p.location_id for p in performances)),
        "budget_by_currency": list(budget_by_currency.values()),
        "sales_by_currency": list(sales_by_currency.values()),
        "exchange_rates": exchange_rates_resp,
    }
    if not rates_live:
        summary["rates_warning"] = "Exchange rates unavailable - amounts shown without conversion"

    return BudgetPerformanceReport(
        performances=performances,
        summary=summary
    )


# ── Catch-all routes with path parameters MUST come after specific routes ──

@router.get("/{budget_id}", response_model=BudgetResponse)
async def get_budget(
    budget_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("page:budgets")),
):
    """
    Get a specific budget by ID
    """
    budget = db.query(Budget).filter(Budget.id == uuid_lib.UUID(budget_id)).first()

    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )

    # Check user has access
    accessible_locations = get_accessible_locations(db, current_user)
    if str(budget.location_id) not in accessible_locations:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this budget"
        )

    return BudgetResponse(
        id=str(budget.id),
        location_id=str(budget.location_id),
        date=budget.date,
        budget_amount=budget.budget_amount,
        currency=budget.currency,
        budget_type=budget.budget_type,
        notes=budget.notes,
        created_by=str(budget.created_by),
        created_at=budget.created_at,
        updated_at=budget.updated_at,
    )


@router.patch("/{budget_id}", response_model=BudgetResponse)
async def update_budget(
    budget_id: str,
    budget_update: BudgetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("feature:manage_budgets")),
):
    """
    Update a budget
    """
    budget = db.query(Budget).filter(Budget.id == uuid_lib.UUID(budget_id)).first()

    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )

    # Check user has access
    accessible_locations = get_accessible_locations(db, current_user)
    if str(budget.location_id) not in accessible_locations:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this budget"
        )

    # Update fields
    if budget_update.budget_amount is not None:
        budget.budget_amount = budget_update.budget_amount
    if budget_update.budget_type is not None:
        budget.budget_type = budget_update.budget_type
    if budget_update.notes is not None:
        budget.notes = budget_update.notes

    db.commit()
    db.refresh(budget)

    return BudgetResponse(
        id=str(budget.id),
        location_id=str(budget.location_id),
        date=budget.date,
        budget_amount=budget.budget_amount,
        currency=budget.currency,
        budget_type=budget.budget_type,
        notes=budget.notes,
        created_by=str(budget.created_by),
        created_at=budget.created_at,
        updated_at=budget.updated_at,
    )


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(
    budget_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("feature:manage_budgets")),
):
    """
    Delete a budget
    """
    budget = db.query(Budget).filter(Budget.id == uuid_lib.UUID(budget_id)).first()

    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )

    # Check user has access
    accessible_locations = get_accessible_locations(db, current_user)
    if str(budget.location_id) not in accessible_locations:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this budget"
        )

    db.delete(budget)
    db.commit()

    return None
