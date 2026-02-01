"""
Sales API Endpoints
"""
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, and_, or_, cast, Integer, text
from datetime import datetime, timedelta, timezone
import math


def calculate_date_range_from_preset(date_preset: str) -> tuple[datetime, datetime]:
    """Calculate start_date and end_date based on preset"""
    now = datetime.utcnow()

    if date_preset == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = now
    elif date_preset == "yesterday":
        yesterday = now - timedelta(days=1)
        start_date = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = yesterday.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif date_preset == "this_week":
        # Start of week (Monday)
        days_since_monday = now.weekday()
        start_date = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = now
    elif date_preset == "this_month":
        # Start of month
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = now
    elif date_preset == "this_year":
        # Start of year
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = now
    else:
        # Default fallback
        start_date = now - timedelta(days=60)
        end_date = now

    return start_date, end_date

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.sales_transaction import SalesTransaction
from app.models.location import Location
from app.models.square_account import SquareAccount
from app.models.catalog_category import CatalogItemCategory
from app.models.client import Client, user_clients
from app.models.catalog_hierarchy import ClientCatalogMapping
from app.schemas.sales import (
    SalesTransactionResponse,
    SalesTransactionDetail,
    SalesTransactionList,
    SalesAggregation,
    SalesSummary,
)

router = APIRouter(tags=["sales"])


MULTI_CLIENT_ROLES = {"store_manager", "reporting", "manager"}


def _effective_client_id(user: User, client_id: Optional[str], db: Session = None) -> Optional[str]:
    """Return the effective client_id for filtering.

    - Client-role users: always locked to their single client_id.
    - Multi-client roles (store_manager/reporting/manager): if they select a
      specific client, validate it's in their allowed list; otherwise None.
    - Admin/superadmin: pass through the query param.
    """
    role_val = user.role.value if isinstance(user.role, UserRole) else user.role

    # Client role: always locked
    if role_val == "client" and user.client_id:
        return str(user.client_id)

    # Multi-client roles
    if role_val in MULTI_CLIENT_ROLES and db is not None:
        rows = db.query(user_clients.c.client_id).filter(user_clients.c.user_id == user.id).all()
        allowed = {str(r[0]) for r in rows}
        if client_id and client_id in allowed:
            return client_id
        if allowed:
            return None  # no specific selection → combined view (handled by filter context)
        # No clients assigned — fall through to legacy client_id
        if user.client_id:
            return str(user.client_id)
        return None

    # Legacy fallback for users with single client_id
    if user.client_id:
        return str(user.client_id)
    return client_id


def _get_allowed_client_ids(user: User, db: Session) -> Optional[List[str]]:
    """Return list of client IDs the user is allowed to access, or None for unrestricted."""
    role_val = user.role.value if isinstance(user.role, UserRole) else user.role

    if role_val == "client" and user.client_id:
        return [str(user.client_id)]

    if role_val in MULTI_CLIENT_ROLES:
        rows = db.query(user_clients.c.client_id).filter(user_clients.c.user_id == user.id).all()
        if rows:
            return [str(r[0]) for r in rows]
        # Fallback to legacy single client_id
        if user.client_id:
            return [str(user.client_id)]
        return []

    return None  # admin/superadmin: unrestricted


def get_accessible_locations(db: Session, user: User) -> List[str]:
    """
    Get list of location IDs accessible by the user based on their role.
    All non-superadmin roles get all org locations — client filtering is
    handled separately via _get_client_filter_context.
    """
    # All authenticated users can see all locations in their organization.
    # Per-client filtering happens at the endpoint level via _effective_client_id
    # and _get_client_filter_context.
    locations = db.query(Location.id).join(SquareAccount).filter(
        SquareAccount.organization_id == user.organization_id
    ).all()
    return [str(loc.id) for loc in locations]


def _get_filtered_location_ids(
    db: Session,
    accessible_location_ids: List[str],
    client_id: Optional[str],
    location_ids: Optional[str],
    allowed_client_ids: Optional[List[str]] = None,
) -> List[str]:
    """Common helper to filter location IDs by client and explicit location filter."""
    from app.models.client import client_locations as cl
    filtered = list(accessible_location_ids)

    if client_id:
        client_location_ids = db.query(cl.c.location_id).filter(
            cl.c.client_id == client_id
        ).all()
        client_location_ids = [str(loc_id[0]) for loc_id in client_location_ids]
        filtered = [lid for lid in filtered if lid in client_location_ids]
    elif allowed_client_ids is not None:
        # Multi-client user with no specific selection: union locations from all allowed clients
        if allowed_client_ids:
            multi_loc_rows = db.query(cl.c.location_id).filter(
                cl.c.client_id.in_(allowed_client_ids)
            ).all()
            multi_loc_ids = {str(r[0]) for r in multi_loc_rows}
            filtered = [lid for lid in filtered if lid in multi_loc_ids]
        else:
            filtered = []

    if location_ids:
        requested_ids = [lid.strip() for lid in location_ids.split(',')]
        filtered = [lid for lid in filtered if lid in requested_ids]

    return filtered


def _get_client_filter_context(
    db: Session,
    accessible_location_ids: List[str],
    client_id: Optional[str],
    location_ids: Optional[str],
    allowed_client_ids: Optional[List[str]] = None,
) -> dict:
    """Determine filtering mode for a request.

    Returns a dict with:
      mode: "location" | "category"
      location_ids: list of location IDs to filter on
      catalog_object_ids: set of product IDs (category mode only)
    """
    if client_id:
        client = db.query(Client).filter(Client.id == client_id).first()
        if client and client.category_keywords:
            # CATEGORY MODE: use pre-computed client→product mappings
            rows = db.query(ClientCatalogMapping.catalog_object_id).filter(
                ClientCatalogMapping.client_id == client.id
            ).all()
            catalog_object_ids = {r[0] for r in rows}

            return {
                "mode": "category",
                "location_ids": list(accessible_location_ids),  # ALL locations
                "catalog_object_ids": catalog_object_ids,
            }

    # LOCATION MODE (existing behavior, now with multi-client support)
    filtered = _get_filtered_location_ids(db, accessible_location_ids, client_id, location_ids, allowed_client_ids)
    return {"mode": "location", "location_ids": filtered, "catalog_object_ids": set()}


def _resolve_date_range(
    date_preset: Optional[str],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
    days: int = 60,
) -> tuple[datetime, datetime]:
    """Resolve date range from preset, explicit dates, or days fallback."""
    if date_preset:
        return calculate_date_range_from_preset(date_preset)
    s = start_date or datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days)
    e = end_date or datetime.utcnow().replace(hour=23, minute=59, second=59, microsecond=999999)
    return s, e


def _base_sales_filter(
    location_ids: List[str],
    start: datetime,
    end: datetime,
    completed_only: bool = True,
):
    """Build common filter conditions for sales queries."""
    conditions = [
        SalesTransaction.location_id.in_(location_ids),
        SalesTransaction.transaction_date >= start,
        SalesTransaction.transaction_date <= end,
    ]
    if completed_only:
        conditions.append(SalesTransaction.payment_status == "COMPLETED")
    return and_(*conditions)


def _txn_matches_category(line_items_json, cat_ids: set) -> bool:
    """Return True if any line item's catalog_object_id is in cat_ids."""
    if not line_items_json:
        return False
    return any(item.get("catalog_object_id", "") in cat_ids for item in line_items_json)


# ─────────────────────────────────────────────────
# TRANSACTIONS (paginated – already efficient)
# ─────────────────────────────────────────────────


@router.get("/transactions", response_model=SalesTransactionList)
async def list_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    location_ids: Optional[str] = Query(None, description="Comma-separated location IDs"),
    client_id: Optional[str] = Query(None, description="Filter by client ID"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    date_preset: Optional[str] = Query(None, description="Date preset: today, this_week, this_month, this_year"),
    days: Optional[int] = Query(None, ge=1, le=3650, description="Number of days to look back"),
    payment_status: Optional[str] = Query(None),
    tender_type: Optional[str] = Query(None),
    min_amount: Optional[int] = Query(None, description="Minimum amount in cents"),
    max_amount: Optional[int] = Query(None, description="Maximum amount in cents"),
    currency: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    sort_by: str = Query("transaction_date", regex="^(transaction_date|amount_money_amount|total_money_amount)$"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
):
    """List sales transactions with filtering and pagination"""
    accessible_location_ids = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible_location_ids, client_id, location_ids, allowed)
    filtered_location_ids = ctx["location_ids"]
    cat_ids = ctx["catalog_object_ids"] if ctx["mode"] == "category" else None

    # Resolve date range — only apply default if dates, preset, or days were explicitly given
    if date_preset or start_date or end_date or days:
        resolved_start, resolved_end = _resolve_date_range(date_preset, start_date, end_date, days=days or 60)
    else:
        resolved_start, resolved_end = None, None

    from sqlalchemy.orm import joinedload
    query = db.query(SalesTransaction).options(joinedload(SalesTransaction.location)).join(Location).filter(
        Location.id.in_(filtered_location_ids)
    )

    if location_ids and ctx["mode"] != "category":
        # location_ids already handled by _get_client_filter_context in location mode
        pass

    if resolved_start:
        query = query.filter(SalesTransaction.transaction_date >= resolved_start)
    if resolved_end:
        query = query.filter(SalesTransaction.transaction_date <= resolved_end)
    if payment_status:
        query = query.filter(SalesTransaction.payment_status == payment_status)
    if tender_type:
        query = query.filter(SalesTransaction.tender_type == tender_type)
    if min_amount is not None:
        query = query.filter(SalesTransaction.amount_money_amount >= min_amount)
    if max_amount is not None:
        query = query.filter(SalesTransaction.amount_money_amount <= max_amount)
    if currency:
        query = query.filter(SalesTransaction.amount_money_currency == currency)

    def _build_txn_data(txn):
        location_name = txn.location.name if txn.location else "Unknown"
        raw_data = txn.raw_data or {}
        refunds = raw_data.get("refunds", [])
        has_refund = len(refunds) > 0
        refund_amount = sum(r.get("amount_money", {}).get("amount", 0) for r in refunds) if has_refund else 0
        return {
            "id": str(txn.id),
            "location_id": str(txn.location_id),
            "location_name": location_name,
            "square_transaction_id": txn.square_transaction_id,
            "transaction_date": txn.transaction_date,
            "amount_money_amount": txn.amount_money_amount,
            "amount_money_currency": txn.amount_money_currency,
            "total_money_amount": txn.total_money_amount,
            "amount_money_usd_equivalent": txn.amount_money_usd_equivalent,
            "total_money_currency": txn.total_money_currency,
            "total_discount_amount": txn.total_discount_amount,
            "has_refund": has_refund,
            "refund_amount": refund_amount,
            "total_tax_amount": txn.total_tax_amount,
            "total_tip_amount": txn.total_tip_amount,
            "tender_type": txn.tender_type,
            "card_brand": txn.card_brand,
            "last_4": txn.last_4,
            "customer_id": txn.customer_id,
            "payment_status": txn.payment_status,
            "created_at": txn.created_at,
        }

    sort_column = getattr(SalesTransaction, sort_by)
    query = query.order_by(desc(sort_column) if sort_order == "desc" else asc(sort_column))

    if cat_ids is not None:
        # Category mode: must post-filter by line items matching catalog IDs
        if not cat_ids:
            return SalesTransactionList(transactions=[], total=0, page=page, page_size=page_size, total_pages=0)
        all_matching = []
        for txn in query.yield_per(500):
            if _txn_matches_category(txn.line_items, cat_ids):
                all_matching.append(txn)
        total = len(all_matching)
        total_pages = math.ceil(total / page_size)
        offset = (page - 1) * page_size
        page_txns = all_matching[offset:offset + page_size]
        transactions_data = [_build_txn_data(txn) for txn in page_txns]
    else:
        # Location mode: standard SQL pagination
        total = query.count()
        offset = (page - 1) * page_size
        transactions = query.offset(offset).limit(page_size).all()
        total_pages = math.ceil(total / page_size)
        transactions_data = [_build_txn_data(txn) for txn in transactions]

    return SalesTransactionList(
        transactions=[SalesTransactionResponse(**txn_data) for txn_data in transactions_data],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/transactions/{transaction_id}", response_model=SalesTransactionDetail)
async def get_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get detailed transaction information"""
    accessible_location_ids = get_accessible_locations(db, current_user)

    transaction = db.query(SalesTransaction).filter(
        SalesTransaction.id == transaction_id,
        SalesTransaction.location_id.in_(accessible_location_ids)
    ).first()

    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    location_name = transaction.location.name if transaction.location else "Unknown"
    raw_data = transaction.raw_data or {}
    refunds = raw_data.get("refunds", [])
    has_refund = len(refunds) > 0
    refund_amount = sum(r.get("amount_money", {}).get("amount", 0) for r in refunds) if has_refund else 0

    txn_data = {
        "id": str(transaction.id),
        "location_id": str(transaction.location_id),
        "location_name": location_name,
        "square_transaction_id": transaction.square_transaction_id,
        "transaction_date": transaction.transaction_date,
        "amount_money_amount": transaction.amount_money_amount,
        "amount_money_currency": transaction.amount_money_currency,
        "total_money_amount": transaction.total_money_amount,
        "amount_money_usd_equivalent": transaction.amount_money_usd_equivalent,
        "total_money_currency": transaction.total_money_currency,
        "total_discount_amount": transaction.total_discount_amount,
        "total_tax_amount": transaction.total_tax_amount,
        "total_tip_amount": transaction.total_tip_amount,
        "tender_type": transaction.tender_type,
        "card_brand": transaction.card_brand,
        "last_4": transaction.last_4,
        "customer_id": transaction.customer_id,
        "payment_status": transaction.payment_status,
        "has_refund": has_refund,
        "refund_amount": refund_amount,
        "created_at": transaction.created_at,
        "product_categories": transaction.product_categories,
        "line_items": transaction.line_items,
        "raw_data": raw_data,
    }

    return SalesTransactionDetail(**txn_data)


# ─────────────────────────────────────────────────
# AGGREGATION (already efficient – single SQL aggregate)
# ─────────────────────────────────────────────────


@router.get("/aggregation", response_model=SalesAggregation)
async def get_sales_aggregation(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    location_ids: Optional[str] = Query(None, description="Comma-separated location IDs"),
    client_id: Optional[str] = Query(None, description="Filter by client ID"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    date_preset: Optional[str] = Query(None, description="Date preset: today, this_week, this_month, this_year"),
    days: Optional[int] = Query(None, ge=1, le=3650, description="Number of days to look back"),
    currency: str = Query("GBP", description="Currency for aggregation"),
):
    """Get aggregated sales data"""
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    filtered = ctx["location_ids"]
    cat_ids = ctx["catalog_object_ids"] if ctx["mode"] == "category" else None
    start, end = _resolve_date_range(date_preset, start_date, end_date, days=days or 60)

    from app.services.exchange_rate_service import exchange_rate_service as _fx

    if cat_ids is not None:
        if not cat_ids:
            return SalesAggregation(total_sales=0, total_transactions=0, average_transaction=0, currency="GBP", start_date=start, end_date=end)
        base = _base_sales_filter(filtered, start, end)
        all_cur: set = set()
        raw_rows = []
        for (line_items_json, amount, cur) in db.query(
            SalesTransaction.line_items, SalesTransaction.amount_money_amount, SalesTransaction.amount_money_currency
        ).filter(base).yield_per(500):
            if not _txn_matches_category(line_items_json, cat_ids):
                continue
            raw_rows.append((int(amount or 0), cur or "GBP"))
            all_cur.add(cur or "GBP")
        rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})
        total_sales = sum(round(amt * rates.get(c, 1.0)) for amt, c in raw_rows)
        total_transactions = len(raw_rows)
        avg_txn = int(total_sales / total_transactions) if total_transactions > 0 else 0
        return SalesAggregation(total_sales=total_sales, total_transactions=total_transactions, average_transaction=avg_txn, currency="GBP", start_date=start, end_date=end)

    # Group by currency so we can convert all to GBP
    rows = db.query(
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.amount_money_amount).label("total_sales"),
        func.count(SalesTransaction.id).label("total_transactions"),
    ).filter(
        _base_sales_filter(filtered, start, end),
    ).group_by(SalesTransaction.amount_money_currency).all()

    all_cur = {r.amount_money_currency or "GBP" for r in rows}
    rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

    total_sales = 0
    total_transactions = 0
    agg_currency_breakdown: Dict[str, dict] = {}
    for row in rows:
        cur = row.amount_money_currency or "GBP"
        rate = rates.get(cur, 1.0)
        raw_amount = int(row.total_sales or 0)
        converted = round(raw_amount * rate)
        total_sales += converted
        total_transactions += int(row.total_transactions or 0)
        if cur not in agg_currency_breakdown:
            agg_currency_breakdown[cur] = {"currency": cur, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
        agg_currency_breakdown[cur]["amount"] += raw_amount
        agg_currency_breakdown[cur]["converted_amount"] += converted

    avg_txn = int(total_sales / total_transactions) if total_transactions > 0 else 0

    return SalesAggregation(
        total_sales=total_sales,
        total_transactions=total_transactions,
        average_transaction=avg_txn,
        currency="GBP",
        start_date=start,
        end_date=end,
        by_currency=list(agg_currency_breakdown.values()) if agg_currency_breakdown and any(c != "GBP" for c in agg_currency_breakdown) else None,
    )


# ─────────────────────────────────────────────────
# SUMMARY (4 SQL aggregates – all efficient)
# ─────────────────────────────────────────────────


@router.get("/summary", response_model=SalesSummary)
async def get_sales_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    location_ids: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None, description="Filter by client ID"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    date_preset: Optional[str] = Query(None, description="Date preset: today, this_week, this_month, this_year"),
    currency: str = Query("GBP"),
):
    """Get comprehensive sales summary"""
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    filtered = ctx["location_ids"]
    cat_ids = ctx["catalog_object_ids"] if ctx["mode"] == "category" else None
    start, end = _resolve_date_range(date_preset, start_date, end_date)

    base = _base_sales_filter(filtered, start, end)

    from app.services.exchange_rate_service import exchange_rate_service as _fx

    # Category mode: scan line_items to filter matching transactions
    if cat_ids is not None:
        if not cat_ids:
            return SalesSummary(total_sales=0, transaction_count=0, average_transaction=0, currency="GBP", period_start=start, period_end=end, by_tender_type={}, by_status={}, top_days=[])

        total_sales = 0
        transaction_count = 0
        by_tender_type: Dict[str, int] = {}
        by_status: Dict[str, int] = {}
        daily_map: Dict[str, Dict[str, Any]] = {}

        # Build location name lookup
        loc_name_map: Dict[str, str] = {}
        if filtered:
            for (lid, lname) in db.query(Location.id, Location.name).filter(Location.id.in_(filtered)).all():
                loc_name_map[str(lid)] = lname or "Unknown"

        # First pass: collect currencies
        all_cur: set = set()
        raw_cat_rows = []
        for (line_items_json, amount, cur, tender, status, txn_date, loc_id) in db.query(
            SalesTransaction.line_items, SalesTransaction.amount_money_amount,
            SalesTransaction.amount_money_currency, SalesTransaction.tender_type,
            SalesTransaction.payment_status, SalesTransaction.transaction_date,
            SalesTransaction.location_id,
        ).filter(base).yield_per(500):
            if not _txn_matches_category(line_items_json, cat_ids):
                continue
            all_cur.add(cur or "GBP")
            raw_cat_rows.append((int(amount or 0), cur or "GBP", tender, status, txn_date, loc_id))

        rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

        for (amt, cur, tender, status, txn_date, loc_id) in raw_cat_rows:
            gbp_amt = round(amt * rates.get(cur, 1.0))
            total_sales += gbp_amt
            transaction_count += 1
            t = tender or "UNKNOWN"
            by_tender_type[t] = by_tender_type.get(t, 0) + gbp_amt
            by_status[status] = by_status.get(status, 0) + 1
            dk = txn_date.date().isoformat()
            loc_str = str(loc_id)
            map_key = f"{dk}|{loc_str}"
            if map_key not in daily_map:
                daily_map[map_key] = {"date": dk, "total_sales": 0, "transaction_count": 0, "location_id": loc_str, "location_name": loc_name_map.get(loc_str, "Unknown")}
            daily_map[map_key]["total_sales"] += gbp_amt
            daily_map[map_key]["transaction_count"] += 1

        avg_txn = int(total_sales / transaction_count) if transaction_count > 0 else 0
        top_days = sorted(daily_map.values(), key=lambda x: (x["date"], x["location_name"]))
        return SalesSummary(total_sales=total_sales, transaction_count=transaction_count, average_transaction=avg_txn, currency="GBP", period_start=start, period_end=end, by_tender_type=by_tender_type, by_status=by_status, top_days=top_days)

    # Location mode: use SQL aggregation, grouped by currency for conversion
    totals_rows = db.query(
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.amount_money_amount).label("total_sales"),
        func.count(SalesTransaction.id).label("transaction_count"),
    ).filter(base).group_by(SalesTransaction.amount_money_currency).all()

    all_cur = {r.amount_money_currency or "GBP" for r in totals_rows}

    tender_rows = db.query(
        SalesTransaction.tender_type,
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.amount_money_amount).label("amount")
    ).filter(base).group_by(SalesTransaction.tender_type, SalesTransaction.amount_money_currency).all()

    status_rows = db.query(
        SalesTransaction.payment_status,
        func.count(SalesTransaction.id).label("count")
    ).filter(base).group_by(SalesTransaction.payment_status).all()
    by_status = {row.payment_status: row.count for row in status_rows}

    # Group by date + location + currency so we can convert
    daily_rows = db.query(
        func.date(SalesTransaction.transaction_date).label("date"),
        SalesTransaction.location_id,
        Location.name.label("location_name"),
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.amount_money_amount).label("total"),
        func.count(SalesTransaction.id).label("count"),
    ).join(Location, SalesTransaction.location_id == Location.id).filter(
        base
    ).group_by(
        func.date(SalesTransaction.transaction_date),
        SalesTransaction.location_id,
        Location.name,
        SalesTransaction.amount_money_currency,
    ).order_by(func.date(SalesTransaction.transaction_date), Location.name).all()

    for r in daily_rows:
        all_cur.add(r.amount_money_currency or "GBP")
    for r in tender_rows:
        all_cur.add(r.amount_money_currency or "GBP")

    rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

    total_sales = 0
    transaction_count = 0
    summary_currency_breakdown: Dict[str, dict] = {}
    for row in totals_rows:
        cur = row.amount_money_currency or "GBP"
        rate = rates.get(cur, 1.0)
        raw_amount = int(row.total_sales or 0)
        converted = round(raw_amount * rate)
        total_sales += converted
        transaction_count += int(row.transaction_count or 0)
        if cur not in summary_currency_breakdown:
            summary_currency_breakdown[cur] = {"currency": cur, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
        summary_currency_breakdown[cur]["amount"] += raw_amount
        summary_currency_breakdown[cur]["converted_amount"] += converted

    by_tender_type: Dict[str, int] = {}
    for row in tender_rows:
        t = row.tender_type or "UNKNOWN"
        rate = rates.get(row.amount_money_currency or "GBP", 1.0)
        by_tender_type[t] = by_tender_type.get(t, 0) + round(int(row.amount or 0) * rate)

    # Merge daily rows across currencies into date+location buckets
    daily_map: Dict[str, Dict[str, Any]] = {}
    for row in daily_rows:
        rate = rates.get(row.amount_money_currency or "GBP", 1.0)
        map_key = f"{row.date.isoformat()}|{row.location_id}"
        if map_key not in daily_map:
            daily_map[map_key] = {
                "date": row.date.isoformat(),
                "total_sales": 0,
                "transaction_count": 0,
                "location_id": str(row.location_id),
                "location_name": row.location_name or "Unknown",
            }
        daily_map[map_key]["total_sales"] += round(int(row.total or 0) * rate)
        daily_map[map_key]["transaction_count"] += int(row.count or 0)

    top_days = sorted(daily_map.values(), key=lambda x: (x["date"], x["location_name"]))

    avg_txn = int(total_sales / transaction_count) if transaction_count > 0 else 0

    return SalesSummary(
        total_sales=total_sales,
        transaction_count=transaction_count,
        average_transaction=avg_txn,
        currency="GBP",
        period_start=start,
        period_end=end,
        by_tender_type=by_tender_type,
        by_status=by_status,
        top_days=top_days,
        by_currency=list(summary_currency_breakdown.values()) if summary_currency_breakdown and any(c != "GBP" for c in summary_currency_breakdown) else None,
    )


# ─────────────────────────────────────────────────
# SALES BY LOCATION (NEW - replaces N frontend calls)
# ─────────────────────────────────────────────────


@router.get("/analytics/sales-by-location", response_model=Dict[str, Any])
async def get_sales_by_location(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    location_ids: Optional[str] = Query(None, description="Comma-separated location IDs"),
    client_id: Optional[str] = Query(None, description="Filter by client ID"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    date_preset: Optional[str] = Query(None),
    currency: str = Query("GBP"),
):
    """
    Get aggregated sales broken down by location in a single query.
    Replaces the need for N separate /aggregation calls.
    """
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    filtered = ctx["location_ids"]
    start, end = _resolve_date_range(date_preset, start_date, end_date)

    if not filtered:
        return {"locations": [], "by_currency": None}

    # Category mode: must scan line items to only count matching products
    if ctx["mode"] == "category":
        cat_ids = ctx["catalog_object_ids"]
        if not cat_ids:
            return {"locations": [], "by_currency": None}

        from app.services.exchange_rate_service import exchange_rate_service as _fx_cat

        base = _base_sales_filter(filtered, start, end)
        loc_agg: Dict[str, dict] = {}
        seen_txn_per_loc: Dict[str, set] = {}

        for (txn_id, loc_id, line_items_json, txn_currency) in db.query(
            SalesTransaction.id,
            SalesTransaction.location_id,
            SalesTransaction.line_items,
            SalesTransaction.amount_money_currency,
        ).filter(base).yield_per(500):
            if not line_items_json:
                continue

            loc_str = str(loc_id)
            txn_has_match = False

            for item in line_items_json:
                obj_id = item.get("catalog_object_id", "")
                if obj_id not in cat_ids:
                    continue

                txn_has_match = True
                item_total = (item.get("gross_sales_money") or {}).get("amount", 0)

                if loc_str not in loc_agg:
                    loc_agg[loc_str] = {"total_sales": 0, "total_transactions": 0, "currency": txn_currency or "GBP"}
                    seen_txn_per_loc[loc_str] = set()
                loc_agg[loc_str]["total_sales"] += item_total

            if txn_has_match:
                txn_key = str(txn_id)
                if loc_str not in seen_txn_per_loc:
                    seen_txn_per_loc[loc_str] = set()
                if txn_key not in seen_txn_per_loc[loc_str]:
                    seen_txn_per_loc[loc_str].add(txn_key)
                    if loc_str in loc_agg:
                        loc_agg[loc_str]["total_transactions"] += 1

        if not loc_agg:
            return {"locations": [], "by_currency": None}

        # Get exchange rates and resolve location names
        all_cur = {d["currency"] for d in loc_agg.values()}
        rates, _ = _fx_cat.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

        loc_details = db.query(Location.id, Location.name, Location.currency).filter(
            Location.id.in_(list(loc_agg.keys()))
        ).all()
        detail_map = {str(lid): (lname, lcurr) for lid, lname, lcurr in loc_details}

        result = []
        loc_cur_bk: Dict[str, dict] = {}
        for loc_str, data in loc_agg.items():
            lname, lcurr = detail_map.get(loc_str, ("Unknown", "GBP"))
            cur = data["currency"]
            rate = rates.get(cur, 1.0)
            raw_sales = data["total_sales"]
            gbp_sales = round(raw_sales * rate)
            total_txn = data["total_transactions"]

            if cur not in loc_cur_bk:
                loc_cur_bk[cur] = {"currency": cur, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
            loc_cur_bk[cur]["amount"] += raw_sales
            loc_cur_bk[cur]["converted_amount"] += gbp_sales

            result.append({
                "location_id": loc_str,
                "location_name": lname,
                "total_sales": gbp_sales,
                "total_transactions": total_txn,
                "average_transaction": round(gbp_sales / total_txn) if total_txn > 0 else 0,
                "currency": "GBP",
            })
        return {
            "locations": sorted(result, key=lambda x: x["total_sales"], reverse=True),
            "by_currency": list(loc_cur_bk.values()) if loc_cur_bk and any(c != "GBP" for c in loc_cur_bk) else None,
        }

    # Location mode: SQL aggregation grouped by currency for conversion
    from app.services.exchange_rate_service import exchange_rate_service as _fx

    rows = db.query(
        SalesTransaction.location_id,
        Location.name.label("location_name"),
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.amount_money_amount).label("total_sales"),
        func.count(SalesTransaction.id).label("total_transactions"),
    ).join(
        Location, SalesTransaction.location_id == Location.id
    ).filter(
        _base_sales_filter(filtered, start, end),
    ).group_by(
        SalesTransaction.location_id, Location.name, SalesTransaction.amount_money_currency
    ).all()

    all_cur = {r.amount_money_currency or "GBP" for r in rows}
    rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

    # Merge rows across currencies into per-location buckets
    loc_agg: Dict[str, dict] = {}
    loc_cur_bk: Dict[str, dict] = {}
    for row in rows:
        loc_str = str(row.location_id)
        cur = row.amount_money_currency or "GBP"
        rate = rates.get(cur, 1.0)
        raw_amount = int(row.total_sales or 0)
        gbp_sales = round(raw_amount * rate)
        txn_count = int(row.total_transactions or 0)
        if loc_str not in loc_agg:
            loc_agg[loc_str] = {"location_name": row.location_name, "total_sales": 0, "total_transactions": 0}
        loc_agg[loc_str]["total_sales"] += gbp_sales
        loc_agg[loc_str]["total_transactions"] += txn_count
        if cur not in loc_cur_bk:
            loc_cur_bk[cur] = {"currency": cur, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
        loc_cur_bk[cur]["amount"] += raw_amount
        loc_cur_bk[cur]["converted_amount"] += gbp_sales

    result = []
    for loc_str, data in loc_agg.items():
        total_txn = data["total_transactions"]
        result.append({
            "location_id": loc_str,
            "location_name": data["location_name"],
            "total_sales": data["total_sales"],
            "total_transactions": total_txn,
            "average_transaction": round(data["total_sales"] / total_txn) if total_txn > 0 else 0,
            "currency": "GBP",
        })
    locations_sorted = sorted(result, key=lambda x: x["total_sales"], reverse=True)
    return {
        "locations": locations_sorted,
        "by_currency": list(loc_cur_bk.values()) if loc_cur_bk and any(c != "GBP" for c in loc_cur_bk) else None,
    }


# ─────────────────────────────────────────────────
# TOP PRODUCTS (optimized: load only line_items column)
# ─────────────────────────────────────────────────


@router.get("/products/top", response_model=Dict[str, Any])
async def get_top_products(
    days: int = Query(60, ge=1, le=365, description="Number of days to look back"),
    limit: int = Query(10000, ge=1, le=10000, description="Number of top products to return"),
    location_ids: Optional[str] = Query(None, description="Comma-separated location IDs"),
    client_id: Optional[str] = Query(None, description="Filter by client ID"),
    date_preset: Optional[str] = Query(None, description="Date preset: today, this_week, this_month, this_year"),
    start_date: Optional[datetime] = Query(None, description="Custom start date"),
    end_date: Optional[datetime] = Query(None, description="Custom end date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get top-selling products by revenue.
    Optimized: only loads the line_items JSONB column instead of full rows.
    """
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    start, end = _resolve_date_range(date_preset, start_date, end_date, days)

    if not ctx["location_ids"]:
        return {"products": [], "total_unique_products": 0}

    from app.services.exchange_rate_service import exchange_rate_service as _fx

    # Select line_items + currency for multi-currency conversion
    rows = db.query(
        SalesTransaction.line_items,
        SalesTransaction.amount_money_currency,
    ).filter(
        _base_sales_filter(ctx["location_ids"], start, end, completed_only=False),
    ).yield_per(500).all()

    # Collect all currencies first
    all_cur = {r.amount_money_currency or "GBP" for r in rows}
    rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

    product_stats: Dict[str, Dict[str, Any]] = {}
    cat_filter = ctx["catalog_object_ids"] if ctx["mode"] == "category" else None

    for (line_items_json, cur) in rows:
        if not line_items_json:
            continue
        rate = rates.get(cur or "GBP", 1.0)
        currency_key = cur or "GBP"
        for item in line_items_json:
            # Category mode: skip products not in the client's mapped set
            if cat_filter is not None:
                obj_id = item.get("catalog_object_id", "")
                if obj_id not in cat_filter:
                    continue

            name = item.get("name", "Unknown")
            quantity = int(item.get("quantity", "1"))
            raw_amount = (item.get("gross_sales_money") or {}).get("amount", 0)
            item_total = round(raw_amount * rate)

            if name not in product_stats:
                product_stats[name] = {
                    "product_name": name,
                    "total_quantity": 0,
                    "total_revenue": 0,
                    "transaction_count": 0,
                    "_orig": {},  # {currency: original_amount} for non-GBP
                    "_orig_gbp": {},  # {currency: gbp_converted_amount} for non-GBP
                }
            product_stats[name]["total_quantity"] += quantity
            product_stats[name]["total_revenue"] += item_total
            product_stats[name]["transaction_count"] += 1
            # Track original and converted amounts for non-GBP currencies
            if currency_key != "GBP":
                product_stats[name]["_orig"][currency_key] = product_stats[name]["_orig"].get(currency_key, 0) + raw_amount
                product_stats[name]["_orig_gbp"][currency_key] = product_stats[name]["_orig_gbp"].get(currency_key, 0) + item_total

    products = []
    for stats in product_stats.values():
        avg_price = stats["total_revenue"] / stats["total_quantity"] if stats["total_quantity"] > 0 else 0
        entry: Dict[str, Any] = {
            "product_name": stats["product_name"],
            "total_quantity": stats["total_quantity"],
            "total_revenue": stats["total_revenue"],
            "transaction_count": stats["transaction_count"],
            "average_price": avg_price,
        }
        if stats["_orig"]:
            entry["original_amounts"] = stats["_orig"]
            entry["converted_amounts"] = stats["_orig_gbp"]
        products.append(entry)

    products.sort(key=lambda x: x["total_revenue"], reverse=True)
    total_unique_products = len(products)
    return {
        "products": products[:limit],
        "total_unique_products": total_unique_products,
    }


# ─────────────────────────────────────────────────
# PRODUCT CATEGORIES (optimized: load only line_items)
# ─────────────────────────────────────────────────


@router.get("/products/categories", response_model=Dict[str, Any])
async def get_product_categories(
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    location_ids: Optional[str] = Query(None, description="Comma-separated location IDs"),
    client_id: Optional[str] = Query(None, description="Filter by client ID"),
    date_preset: Optional[str] = Query(None, description="Date preset: today, this_week, this_month, this_year"),
    start_date: Optional[datetime] = Query(None, description="Custom start date"),
    end_date: Optional[datetime] = Query(None, description="Custom end date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get sales breakdown by product categories"""
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    start, end = _resolve_date_range(date_preset, start_date, end_date, days)

    if not ctx["location_ids"]:
        return {"categories": [], "products": [], "variants": [], "total_items": 0, "total_revenue": 0}

    # Build catalog_object_id → category_name lookup from the cache table
    # Get square_account_ids for the user's org
    account_ids = [
        str(r[0]) for r in db.query(SquareAccount.id).filter(
            SquareAccount.organization_id == current_user.organization_id
        ).all()
    ]
    catalog_lookup: Dict[str, str] = {}
    if account_ids:
        for row in db.query(
            CatalogItemCategory.catalog_object_id,
            CatalogItemCategory.category_name,
        ).filter(CatalogItemCategory.square_account_id.in_(account_ids)).all():
            catalog_lookup[row[0]] = row[1]

    from app.services.exchange_rate_service import exchange_rate_service as _fx

    rows = db.query(
        SalesTransaction.line_items,
        SalesTransaction.amount_money_currency,
    ).filter(
        _base_sales_filter(ctx["location_ids"], start, end, completed_only=False),
    ).yield_per(500).all()

    all_cur = {r.amount_money_currency or "GBP" for r in rows}
    rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

    category_stats: Dict[str, Dict[str, Any]] = {}
    product_stats: Dict[str, Dict[str, Any]] = {}
    variant_stats: Dict[str, Dict[str, Any]] = {}
    cat_cur_bk: Dict[str, dict] = {}
    total_items = 0
    total_revenue = 0
    cat_filter = ctx["catalog_object_ids"] if ctx["mode"] == "category" else None

    for (line_items_json, cur) in rows:
        if not line_items_json:
            continue
        currency_key = cur or "GBP"
        rate = rates.get(currency_key, 1.0)
        for item in line_items_json:
            catalog_obj_id = item.get("catalog_object_id", "")

            # Category mode: skip products not in the client's mapped set
            if cat_filter is not None and catalog_obj_id not in cat_filter:
                continue

            product_name = item.get("name", "Uncategorized")
            variation = item.get("variation_name") or "Standard"
            quantity = int(item.get("quantity", "1"))
            raw_amount = (item.get("gross_sales_money") or {}).get("amount", 0)
            item_total = round(raw_amount * rate)

            # Look up reporting category via catalog_object_id
            reporting_category = catalog_lookup.get(catalog_obj_id, "Uncategorized")

            # By reporting category
            if reporting_category not in category_stats:
                category_stats[reporting_category] = {"category": reporting_category, "quantity": 0, "revenue": 0, "transaction_count": 0}
            category_stats[reporting_category]["quantity"] += quantity
            category_stats[reporting_category]["revenue"] += item_total
            category_stats[reporting_category]["transaction_count"] += 1

            # By product
            if product_name not in product_stats:
                product_stats[product_name] = {"category": product_name, "quantity": 0, "revenue": 0, "transaction_count": 0}
            product_stats[product_name]["quantity"] += quantity
            product_stats[product_name]["revenue"] += item_total
            product_stats[product_name]["transaction_count"] += 1

            # By variant (size/type)
            variant_key = f"{product_name} — {variation}"
            if variant_key not in variant_stats:
                variant_stats[variant_key] = {
                    "variant": variant_key,
                    "product_name": product_name,
                    "variation_name": variation,
                    "quantity": 0,
                    "revenue": 0,
                    "transaction_count": 0,
                    "_orig": {},
                    "_orig_gbp": {},
                }
            variant_stats[variant_key]["quantity"] += quantity
            variant_stats[variant_key]["revenue"] += item_total
            variant_stats[variant_key]["transaction_count"] += 1
            if currency_key != "GBP":
                variant_stats[variant_key]["_orig"][currency_key] = variant_stats[variant_key]["_orig"].get(currency_key, 0) + raw_amount
                variant_stats[variant_key]["_orig_gbp"][currency_key] = variant_stats[variant_key]["_orig_gbp"].get(currency_key, 0) + item_total

            total_items += quantity
            total_revenue += item_total

            if currency_key not in cat_cur_bk:
                cat_cur_bk[currency_key] = {"currency": currency_key, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
            cat_cur_bk[currency_key]["amount"] += raw_amount
            cat_cur_bk[currency_key]["converted_amount"] += item_total

    categories = sorted(category_stats.values(), key=lambda x: x["revenue"], reverse=True)
    products = sorted(product_stats.values(), key=lambda x: x["revenue"], reverse=True)
    # Add original_amounts to variants for multi-currency display
    variants_list = []
    for v in variant_stats.values():
        entry = {k: v[k] for k in ("variant", "product_name", "variation_name", "quantity", "revenue", "transaction_count")}
        if v["_orig"]:
            entry["original_amounts"] = v["_orig"]
            entry["converted_amounts"] = v["_orig_gbp"]
        variants_list.append(entry)
    variants = sorted(variants_list, key=lambda x: x["revenue"], reverse=True)
    return {
        "categories": categories,
        "products": products,
        "variants": variants,
        "total_items": total_items,
        "total_revenue": total_revenue,
        "by_currency": list(cat_cur_bk.values()) if cat_cur_bk and any(c != "GBP" for c in cat_cur_bk) else None,
    }


# ─────────────────────────────────────────────────
# BASKET ANALYTICS (optimized: SQL aggregation + lighter JSONB scan)
# ─────────────────────────────────────────────────


@router.get("/analytics/basket", response_model=Dict[str, Any])
async def get_basket_analytics(
    days: int = Query(60, ge=1, le=365, description="Number of days to look back"),
    location_ids: Optional[str] = Query(None, description="Comma-separated location IDs"),
    client_id: Optional[str] = Query(None, description="Filter by client ID"),
    date_preset: Optional[str] = Query(None, description="Date preset: today, this_week, this_month, this_year"),
    start_date: Optional[datetime] = Query(None, description="Custom start date"),
    end_date: Optional[datetime] = Query(None, description="Custom end date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get basket/order analytics using SQL aggregation + minimal JSONB scan."""
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    filtered = ctx["location_ids"]
    cat_ids = ctx["catalog_object_ids"] if ctx["mode"] == "category" else None
    start, end = _resolve_date_range(date_preset, start_date, end_date, days)

    empty = {"average_order_value": 0, "average_items_per_order": 0, "total_orders": 0, "total_items": 0, "currency": "GBP"}
    if not filtered:
        return empty
    if cat_ids is not None and not cat_ids:
        return empty

    base = _base_sales_filter(filtered, start, end, completed_only=False)

    from app.services.exchange_rate_service import exchange_rate_service as _fx

    # Category mode: scan line_items to filter
    if cat_ids is not None:
        total_revenue = 0
        total_orders = 0
        total_items = 0

        all_cur: set = set()
        raw_rows = []
        for (line_items_json, total_amount, cur) in db.query(
            SalesTransaction.line_items, SalesTransaction.total_money_amount, SalesTransaction.total_money_currency,
        ).filter(base).yield_per(500):
            if not _txn_matches_category(line_items_json, cat_ids):
                continue
            all_cur.add(cur or "GBP")
            raw_rows.append((line_items_json, int(total_amount or 0), cur or "GBP"))

        rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})
        for (line_items_json, total_amount, cur) in raw_rows:
            rate = rates.get(cur, 1.0)
            total_revenue += round(total_amount * rate)
            total_orders += 1
            if line_items_json:
                for item in line_items_json:
                    if item.get("catalog_object_id", "") in cat_ids:
                        total_items += int(item.get("quantity", "1"))

        if total_orders == 0:
            return empty
        return {
            "average_order_value": int(total_revenue / total_orders),
            "average_items_per_order": round(total_items / total_orders, 2),
            "total_orders": total_orders,
            "total_items": total_items,
            "currency": "GBP",
        }

    # Location mode: SQL aggregation grouped by currency for conversion
    agg_rows = db.query(
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.total_money_amount).label("total_revenue"),
        func.count(SalesTransaction.id).label("total_orders"),
    ).filter(base).group_by(SalesTransaction.amount_money_currency).all()

    all_cur = {r.amount_money_currency or "GBP" for r in agg_rows}
    rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

    total_revenue = 0
    total_orders = 0
    for row in agg_rows:
        rate = rates.get(row.amount_money_currency or "GBP", 1.0)
        total_revenue += round(int(row.total_revenue or 0) * rate)
        total_orders += int(row.total_orders or 0)

    if total_orders == 0:
        return empty

    total_items = 0
    for (line_items_json,) in db.query(SalesTransaction.line_items).filter(base).yield_per(1000):
        if not line_items_json:
            continue
        for item in line_items_json:
            total_items += int(item.get("quantity", "1"))

    average_order_value = int(total_revenue / total_orders)
    average_items_per_order = total_items / total_orders

    return {
        "average_order_value": average_order_value,
        "average_items_per_order": round(average_items_per_order, 2),
        "total_orders": total_orders,
        "total_items": total_items,
        "currency": "GBP",
    }


# ─────────────────────────────────────────────────
# HOURLY SALES (optimized: SQL EXTRACT + GROUP BY)
# ─────────────────────────────────────────────────


@router.get("/analytics/hourly", response_model=Dict[str, Any])
async def get_hourly_sales(
    days: int = Query(60, ge=1, le=365, description="Number of days to look back"),
    location_ids: Optional[str] = Query(None, description="Comma-separated location IDs"),
    client_id: Optional[str] = Query(None, description="Filter by client ID"),
    date_preset: Optional[str] = Query(None, description="Date preset: today, this_week, this_month, this_year"),
    start_date: Optional[datetime] = Query(None, description="Custom start date"),
    end_date: Optional[datetime] = Query(None, description="Custom end date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get hourly sales breakdown using SQL EXTRACT for performance."""
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    filtered = ctx["location_ids"]
    cat_ids = ctx["catalog_object_ids"] if ctx["mode"] == "category" else None
    start, end = _resolve_date_range(date_preset, start_date, end_date, days)

    empty_hours = [{"hour": h, "sales": 0, "transactions": 0, "items": 0} for h in range(24)]
    if not filtered:
        return {"hours": empty_hours, "by_currency": None}
    if cat_ids is not None and not cat_ids:
        return {"hours": empty_hours, "by_currency": None}

    base = _base_sales_filter(filtered, start, end, completed_only=False)

    # Category mode: scan line_items to filter, with currency conversion
    if cat_ids is not None:
        from app.services.exchange_rate_service import exchange_rate_service as _fx_cat_h

        # First pass: collect matched transactions and currencies
        matched = []
        all_cur_h: set = set()
        for (txn_date, line_items_json, total_amount, txn_cur) in db.query(
            SalesTransaction.transaction_date, SalesTransaction.line_items,
            SalesTransaction.amount_money_amount, SalesTransaction.amount_money_currency,
        ).filter(base).yield_per(500):
            if not _txn_matches_category(line_items_json, cat_ids):
                continue
            cur = txn_cur or "GBP"
            all_cur_h.add(cur)
            matched.append((txn_date, int(total_amount or 0), cur, line_items_json))

        rates_h, _ = _fx_cat_h.get_rates_to_gbp(db, current_user.organization_id, all_cur_h or {"GBP"})

        hourly_stats = {h: {"hour": h, "sales": 0, "transactions": 0, "items": 0} for h in range(24)}
        hourly_cur_bk_cat: Dict[str, dict] = {}
        for txn_date, total_amount, cur, line_items_json in matched:
            rate = rates_h.get(cur, 1.0)
            converted = round(total_amount * rate)
            h = txn_date.hour
            hourly_stats[h]["sales"] += converted
            hourly_stats[h]["transactions"] += 1
            if cur not in hourly_cur_bk_cat:
                hourly_cur_bk_cat[cur] = {"currency": cur, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
            hourly_cur_bk_cat[cur]["amount"] += total_amount
            hourly_cur_bk_cat[cur]["converted_amount"] += converted
            if line_items_json:
                for item in line_items_json:
                    if item.get("catalog_object_id", "") in cat_ids:
                        hourly_stats[h]["items"] += int(item.get("quantity", "1"))
        return {
            "hours": sorted(hourly_stats.values(), key=lambda x: x["hour"]),
            "by_currency": list(hourly_cur_bk_cat.values()) if hourly_cur_bk_cat and any(c != "GBP" for c in hourly_cur_bk_cat) else None,
        }

    # Location mode: SQL aggregation, grouped by currency for conversion
    from app.services.exchange_rate_service import exchange_rate_service as _fx
    hour_col = func.extract('hour', SalesTransaction.transaction_date).label("hour")

    rows = db.query(
        hour_col,
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.amount_money_amount).label("sales"),
        func.count(SalesTransaction.id).label("transactions"),
    ).filter(base).group_by(hour_col, SalesTransaction.amount_money_currency).all()

    all_cur = {r.amount_money_currency or "GBP" for r in rows}
    rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

    hourly_stats = {h: {"hour": h, "sales": 0, "transactions": 0, "items": 0} for h in range(24)}
    hourly_cur_bk: Dict[str, dict] = {}
    for row in rows:
        h = int(row.hour)
        cur = row.amount_money_currency or "GBP"
        rate = rates.get(cur, 1.0)
        raw_amount = int(row.sales or 0)
        converted = round(raw_amount * rate)
        hourly_stats[h]["sales"] += converted
        hourly_stats[h]["transactions"] += int(row.transactions or 0)
        if cur not in hourly_cur_bk:
            hourly_cur_bk[cur] = {"currency": cur, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
        hourly_cur_bk[cur]["amount"] += raw_amount
        hourly_cur_bk[cur]["converted_amount"] += converted

    hours_with_data = {int(row.hour) for row in rows}
    if hours_with_data:
        for (txn_date, line_items_json) in db.query(
            SalesTransaction.transaction_date, SalesTransaction.line_items
        ).filter(base).yield_per(1000):
            if not line_items_json:
                continue
            h = txn_date.hour
            for item in line_items_json:
                hourly_stats[h]["items"] += int(item.get("quantity", "1"))

    return {
        "hours": sorted(hourly_stats.values(), key=lambda x: x["hour"]),
        "by_currency": list(hourly_cur_bk.values()) if hourly_cur_bk and any(c != "GBP" for c in hourly_cur_bk) else None,
    }


# ─────────────────────────────────────────────────
# REFUNDS (optimized: SQL aggregation on payment_status)
# ─────────────────────────────────────────────────


@router.get("/analytics/refunds", response_model=Dict[str, Any])
async def get_refunds_analytics(
    days: int = Query(60, ge=1, le=365, description="Number of days to look back"),
    location_ids: Optional[str] = Query(None, description="Comma-separated location IDs"),
    client_id: Optional[str] = Query(None, description="Filter by client ID"),
    date_preset: Optional[str] = Query(None, description="Date preset: today, this_week, this_month, this_year"),
    start_date: Optional[datetime] = Query(None, description="Custom start date"),
    end_date: Optional[datetime] = Query(None, description="Custom end date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get refunds analytics using SQL aggregation."""
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    filtered = ctx["location_ids"]
    cat_ids = ctx["catalog_object_ids"] if ctx["mode"] == "category" else None
    start, end = _resolve_date_range(date_preset, start_date, end_date, days)

    if not filtered:
        return {"total_refunds": 0, "total_refund_amount": 0, "refund_rate": 0, "currency": "GBP"}
    if cat_ids is not None and not cat_ids:
        return {"total_refunds": 0, "total_refund_amount": 0, "refund_rate": 0, "currency": "GBP"}

    base = _base_sales_filter(filtered, start, end, completed_only=False)

    from app.services.exchange_rate_service import exchange_rate_service as _fx

    # Category mode: query all returns at matched locations (same approach as fast-summary).
    # Uses raw_data->'returns' to capture all merchandise returns including exchanges.
    if cat_ids is not None:
        # First find which locations have category-matched products
        matched_locs: set = set()
        total_orders = 0
        all_cur: set = set()
        for (line_items_json, loc_id, cur) in db.query(
            SalesTransaction.line_items, SalesTransaction.location_id, SalesTransaction.amount_money_currency
        ).filter(base).yield_per(500):
            if not line_items_json:
                continue
            has_match = any(
                item.get("catalog_object_id", "") in cat_ids
                for item in line_items_json
            )
            if has_match:
                total_orders += 1
                matched_locs.add(loc_id)
                all_cur.add(cur or "GBP")

        rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

        refund_count = 0
        total_refund_amount = 0
        refund_cur_bk: Dict[str, dict] = {}
        if matched_locs:
            return_rows = db.query(
                SalesTransaction.amount_money_currency,
                SalesTransaction.raw_data["returns"],
            ).filter(
                SalesTransaction.location_id.in_(list(matched_locs)),
                SalesTransaction.transaction_date >= start,
                SalesTransaction.transaction_date <= end,
                SalesTransaction.raw_data["returns"] != None,  # noqa: E711
            ).all()
            for (rcurrency, returns_json) in return_rows:
                if not returns_json or not isinstance(returns_json, list):
                    continue
                cur = rcurrency or "GBP"
                rate = rates.get(cur, 1.0)
                for ret in returns_json:
                    return_amounts = ret.get("return_amounts") or {}
                    total_money = (return_amounts.get("total_money") or {}).get("amount", 0)
                    tax_money = (return_amounts.get("tax_money") or {}).get("amount", 0)
                    return_amt = total_money - tax_money  # ex-tax to match Square
                    if return_amt > 0:
                        converted = round(return_amt * rate)
                        total_refund_amount += converted
                        refund_count += 1
                        if cur not in refund_cur_bk:
                            refund_cur_bk[cur] = {"currency": cur, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
                        refund_cur_bk[cur]["amount"] += return_amt
                        refund_cur_bk[cur]["converted_amount"] += converted

        refund_rate = (refund_count / total_orders * 100) if total_orders > 0 else 0
        return {
            "total_refunds": refund_count,
            "total_refund_amount": total_refund_amount,
            "refund_rate": round(refund_rate, 2),
            "currency": "GBP",
            "by_currency": list(refund_cur_bk.values()) if refund_count > 0 and any(c != "GBP" for c in refund_cur_bk) else None,
        }

    # Location mode: use SQL aggregation with returns (merchandise returns) instead of refunds
    result = db.query(
        func.count(SalesTransaction.id).label("total_orders"),
        func.count(SalesTransaction.id).filter(
            func.jsonb_array_length(
                func.coalesce(SalesTransaction.raw_data['returns'], text("'[]'::jsonb"))
            ) > 0
        ).label("return_count"),
    ).filter(base).first()

    total_orders = int(result.total_orders or 0)
    return_count = int(result.return_count or 0)

    total_refund_amount = 0
    refund_cur_bk: Dict[str, dict] = {}
    if return_count > 0:
        return_filter = and_(
            base,
            func.jsonb_array_length(
                func.coalesce(SalesTransaction.raw_data['returns'], text("'[]'::jsonb"))
            ) > 0,
        )
        # Get currencies for exchange rate conversion
        all_cur: set = set()
        return_rows = []
        for (returns_json, cur) in db.query(
            SalesTransaction.raw_data["returns"], SalesTransaction.amount_money_currency
        ).filter(return_filter).yield_per(500):
            if not returns_json:
                continue
            all_cur.add(cur or "GBP")
            return_rows.append((returns_json, cur or "GBP"))

        rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})
        for (returns_json, cur) in return_rows:
            rate = rates.get(cur, 1.0)
            if not isinstance(returns_json, list):
                continue
            for ret in returns_json:
                return_amounts = ret.get("return_amounts") or {}
                total_money = (return_amounts.get("total_money") or {}).get("amount", 0)
                tax_money = (return_amounts.get("tax_money") or {}).get("amount", 0)
                raw_amt = total_money - tax_money  # ex-tax to match Square
                if raw_amt > 0:
                    converted = round(raw_amt * rate)
                    total_refund_amount += converted
                    if cur not in refund_cur_bk:
                        refund_cur_bk[cur] = {"currency": cur, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
                    refund_cur_bk[cur]["amount"] += raw_amt
                    refund_cur_bk[cur]["converted_amount"] += converted

    refund_rate = (return_count / total_orders * 100) if total_orders > 0 else 0

    return {
        "total_refunds": return_count,
        "total_refund_amount": total_refund_amount,
        "refund_rate": round(refund_rate, 2),
        "currency": "GBP",
        "by_currency": list(refund_cur_bk.values()) if return_count > 0 and any(c != "GBP" for c in refund_cur_bk) else None,
    }


# ─────────────────────────────────────────────────
# REFUNDS DAILY (daily breakdown for refund report)
# ─────────────────────────────────────────────────


@router.get("/analytics/refunds-daily", response_model=List[Dict[str, Any]])
async def get_refunds_daily(
    days: int = Query(60, ge=1, le=365),
    location_ids: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    date_preset: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get daily refund breakdown for the refund report."""
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    filtered = ctx["location_ids"]
    cat_ids = ctx["catalog_object_ids"] if ctx["mode"] == "category" else None
    start, end = _resolve_date_range(date_preset, start_date, end_date, days)

    if not filtered:
        return []
    if cat_ids is not None and not cat_ids:
        return []

    base = _base_sales_filter(filtered, start, end, completed_only=False)

    # Category mode: scan line_items (lightweight) then query returns separately
    if cat_ids is not None:
        daily_map: Dict[str, dict] = {}
        matched_locs: set = set()

        # Lightweight scan — no raw_data
        for (txn_date, line_items_json, amount, loc_id) in db.query(
            SalesTransaction.transaction_date,
            SalesTransaction.line_items,
            SalesTransaction.amount_money_amount,
            SalesTransaction.location_id,
        ).filter(base).yield_per(500):
            if not line_items_json:
                continue
            has_match = any(
                item.get("catalog_object_id", "") in cat_ids
                for item in line_items_json
            )
            if not has_match:
                continue

            matched_locs.add(loc_id)
            date_key = txn_date.date().isoformat()
            if date_key not in daily_map:
                daily_map[date_key] = {"date": date_key, "total_orders": 0, "total_sales": 0, "refund_count": 0, "refund_amount": 0}
            daily_map[date_key]["total_orders"] += 1
            daily_map[date_key]["total_sales"] += int(amount or 0)

        # Separate query for returns — only txns that actually have returns
        from app.services.exchange_rate_service import exchange_rate_service as _fx_daily
        if matched_locs:
            all_cur = set(r[0] for r in db.query(SalesTransaction.amount_money_currency).filter(
                SalesTransaction.location_id.in_(list(matched_locs)),
                SalesTransaction.transaction_date >= start,
                SalesTransaction.transaction_date <= end,
            ).distinct().all())
            rates, _ = _fx_daily.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

            for (txn_date, rcurrency, returns_json) in db.query(
                SalesTransaction.transaction_date,
                SalesTransaction.amount_money_currency,
                SalesTransaction.raw_data["returns"],
            ).filter(
                SalesTransaction.location_id.in_(list(matched_locs)),
                SalesTransaction.transaction_date >= start,
                SalesTransaction.transaction_date <= end,
                SalesTransaction.raw_data["returns"] != None,  # noqa: E711
            ).all():
                if not returns_json or not isinstance(returns_json, list):
                    continue
                date_key = txn_date.date().isoformat()
                if date_key not in daily_map:
                    daily_map[date_key] = {"date": date_key, "total_orders": 0, "total_sales": 0, "refund_count": 0, "refund_amount": 0}
                rate = rates.get(rcurrency or "GBP", 1.0)
                for ret in returns_json:
                    return_amounts = ret.get("return_amounts") or {}
                    total_money = (return_amounts.get("total_money") or {}).get("amount", 0)
                    tax_money = (return_amounts.get("tax_money") or {}).get("amount", 0)
                    return_amt = total_money - tax_money
                    if return_amt > 0:
                        daily_map[date_key]["refund_count"] += 1
                        daily_map[date_key]["refund_amount"] += round(return_amt * rate)

        result = sorted(daily_map.values(), key=lambda x: x["date"])
        for row in result:
            row["refund_rate"] = round((row["refund_count"] / row["total_orders"] * 100) if row["total_orders"] > 0 else 0, 2)
        return result

    # Location mode: use SQL aggregation, grouped by currency for conversion
    from app.services.exchange_rate_service import exchange_rate_service as _fx

    daily_totals = db.query(
        func.date(SalesTransaction.transaction_date).label("date"),
        SalesTransaction.amount_money_currency,
        func.count(SalesTransaction.id).label("total_orders"),
        func.sum(SalesTransaction.amount_money_amount).label("total_sales"),
    ).filter(base).group_by(func.date(SalesTransaction.transaction_date), SalesTransaction.amount_money_currency).all()

    all_cur = {r.amount_money_currency or "GBP" for r in daily_totals}
    rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

    daily_map = {}
    for row in daily_totals:
        dk = row.date.isoformat()
        rate = rates.get(row.amount_money_currency or "GBP", 1.0)
        if dk not in daily_map:
            daily_map[dk] = {"date": dk, "total_orders": 0, "total_sales": 0, "refund_count": 0, "refund_amount": 0}
        daily_map[dk]["total_orders"] += int(row.total_orders or 0)
        daily_map[dk]["total_sales"] += round(int(row.total_sales or 0) * rate)

    refund_filter = and_(
        base,
        func.jsonb_array_length(
            func.coalesce(SalesTransaction.raw_data['refunds'], text("'[]'::jsonb"))
        ) > 0,
    )
    for (txn_date, raw_data_json, cur) in db.query(
        SalesTransaction.transaction_date, SalesTransaction.raw_data, SalesTransaction.amount_money_currency
    ).filter(refund_filter).yield_per(500):
        if not raw_data_json:
            continue
        date_key = txn_date.date().isoformat()
        rate = rates.get(cur or "GBP", 1.0)
        if date_key not in daily_map:
            daily_map[date_key] = {"date": date_key, "total_orders": 0, "total_sales": 0, "refund_count": 0, "refund_amount": 0}
        daily_map[date_key]["refund_count"] += 1
        for refund in raw_data_json.get("refunds", []):
            daily_map[date_key]["refund_amount"] += round(refund.get("amount_money", {}).get("amount", 0) * rate)

    result = sorted(daily_map.values(), key=lambda x: x["date"])
    for row in result:
        row["refund_rate"] = round((row["refund_count"] / row["total_orders"] * 100) if row["total_orders"] > 0 else 0, 2)
    return result


# ─────────────────────────────────────────────────
# TAX SUMMARY (daily + location breakdown)
# ─────────────────────────────────────────────────


@router.get("/analytics/tax-summary", response_model=Dict[str, Any])
async def get_tax_summary(
    days: int = Query(60, ge=1, le=365),
    location_ids: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    date_preset: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get tax collected summary with daily and location breakdowns."""
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    filtered = ctx["location_ids"]
    cat_ids = ctx["catalog_object_ids"] if ctx["mode"] == "category" else None
    start, end = _resolve_date_range(date_preset, start_date, end_date, days)

    empty = {"total_tax": 0, "total_sales": 0, "total_transactions": 0, "tax_rate": 0, "daily": [], "by_location": [], "currency": "GBP"}
    if not filtered:
        return empty
    if cat_ids is not None and not cat_ids:
        return empty

    base = _base_sales_filter(filtered, start, end, completed_only=False)

    # Category mode — with currency conversion and location breakdown
    if cat_ids is not None:
        from app.services.exchange_rate_service import exchange_rate_service as _fx_tax_cat

        loc_name_map = {str(loc.id): loc.name for loc in db.query(Location.id, Location.name).filter(Location.id.in_(filtered)).all()}

        matched = []
        all_cur_tax: set = set()
        for (line_items_json, tax_amt, sales_amt, txn_date, loc_id, cur) in db.query(
            SalesTransaction.line_items, SalesTransaction.total_tax_amount,
            SalesTransaction.amount_money_amount, SalesTransaction.transaction_date,
            SalesTransaction.location_id, SalesTransaction.amount_money_currency,
        ).filter(base).yield_per(500):
            if not _txn_matches_category(line_items_json, cat_ids):
                continue
            c = cur or "GBP"
            all_cur_tax.add(c)
            matched.append((int(tax_amt or 0), int(sales_amt or 0), txn_date, str(loc_id), c))

        rates_tax, _ = _fx_tax_cat.get_rates_to_gbp(db, current_user.organization_id, all_cur_tax or {"GBP"})

        total_tax = 0
        total_sales = 0
        total_transactions = 0
        daily_map: Dict[str, Dict[str, Any]] = {}
        loc_map: Dict[str, Dict[str, Any]] = {}

        for t, s, txn_date, loc_id, cur in matched:
            rate = rates_tax.get(cur, 1.0)
            conv_tax = round(t * rate)
            conv_sales = round(s * rate)
            total_tax += conv_tax
            total_sales += conv_sales
            total_transactions += 1
            dk = txn_date.date().isoformat()
            if dk not in daily_map:
                daily_map[dk] = {"date": dk, "tax": 0, "sales": 0, "transactions": 0}
            daily_map[dk]["tax"] += conv_tax
            daily_map[dk]["sales"] += conv_sales
            daily_map[dk]["transactions"] += 1
            if loc_id not in loc_map:
                loc_map[loc_id] = {"location_id": loc_id, "location_name": loc_name_map.get(loc_id, "Unknown"), "tax": 0, "sales": 0, "transactions": 0}
            loc_map[loc_id]["tax"] += conv_tax
            loc_map[loc_id]["sales"] += conv_sales
            loc_map[loc_id]["transactions"] += 1

        daily = sorted(daily_map.values(), key=lambda x: x["date"])
        by_location = sorted(loc_map.values(), key=lambda x: x["tax"], reverse=True)
        return {
            "total_tax": total_tax, "total_sales": total_sales, "total_transactions": total_transactions,
            "tax_rate": round((total_tax / total_sales * 100) if total_sales > 0 else 0, 2),
            "daily": daily, "by_location": by_location, "currency": "GBP",
        }

    # Location mode — with currency conversion
    from app.services.exchange_rate_service import exchange_rate_service as _fx_tax

    totals_rows = db.query(
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.total_tax_amount).label("total_tax"),
        func.sum(SalesTransaction.amount_money_amount).label("total_sales"),
        func.count(SalesTransaction.id).label("total_transactions"),
    ).filter(base).group_by(SalesTransaction.amount_money_currency).all()

    daily_rows = db.query(
        func.date(SalesTransaction.transaction_date).label("date"),
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.total_tax_amount).label("tax"),
        func.sum(SalesTransaction.amount_money_amount).label("sales"),
        func.count(SalesTransaction.id).label("transactions"),
    ).filter(base).group_by(func.date(SalesTransaction.transaction_date), SalesTransaction.amount_money_currency).order_by(func.date(SalesTransaction.transaction_date)).all()

    loc_rows = db.query(
        Location.id.label("location_id"),
        Location.name.label("location_name"),
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.total_tax_amount).label("tax"),
        func.sum(SalesTransaction.amount_money_amount).label("sales"),
        func.count(SalesTransaction.id).label("transactions"),
    ).join(Location, SalesTransaction.location_id == Location.id).filter(base).group_by(Location.id, Location.name, SalesTransaction.amount_money_currency).order_by(desc("tax")).all()

    all_cur_tax = {r.amount_money_currency or "GBP" for r in totals_rows}
    for r in daily_rows:
        all_cur_tax.add(r.amount_money_currency or "GBP")
    for r in loc_rows:
        all_cur_tax.add(r.amount_money_currency or "GBP")
    rates_tax, _ = _fx_tax.get_rates_to_gbp(db, current_user.organization_id, all_cur_tax or {"GBP"})

    total_tax = 0
    total_sales = 0
    total_transactions = 0
    for row in totals_rows:
        cur = row.amount_money_currency or "GBP"
        rate = rates_tax.get(cur, 1.0)
        total_tax += round(int(row.total_tax or 0) * rate)
        total_sales += round(int(row.total_sales or 0) * rate)
        total_transactions += int(row.total_transactions or 0)

    daily_agg: Dict[str, dict] = {}
    for row in daily_rows:
        dk = row.date.isoformat()
        rate = rates_tax.get(row.amount_money_currency or "GBP", 1.0)
        if dk not in daily_agg:
            daily_agg[dk] = {"date": dk, "tax": 0, "sales": 0, "transactions": 0}
        daily_agg[dk]["tax"] += round(int(row.tax or 0) * rate)
        daily_agg[dk]["sales"] += round(int(row.sales or 0) * rate)
        daily_agg[dk]["transactions"] += int(row.transactions or 0)
    daily = sorted(daily_agg.values(), key=lambda x: x["date"])

    loc_agg: Dict[str, dict] = {}
    for row in loc_rows:
        lid = str(row.location_id)
        rate = rates_tax.get(row.amount_money_currency or "GBP", 1.0)
        if lid not in loc_agg:
            loc_agg[lid] = {"location_id": lid, "location_name": row.location_name, "tax": 0, "sales": 0, "transactions": 0}
        loc_agg[lid]["tax"] += round(int(row.tax or 0) * rate)
        loc_agg[lid]["sales"] += round(int(row.sales or 0) * rate)
        loc_agg[lid]["transactions"] += int(row.transactions or 0)
    by_location = sorted(loc_agg.values(), key=lambda x: x["tax"], reverse=True)

    return {
        "total_tax": total_tax, "total_sales": total_sales,
        "total_transactions": total_transactions,
        "tax_rate": round((total_tax / total_sales * 100) if total_sales > 0 else 0, 2),
        "daily": daily, "by_location": by_location, "currency": "GBP",
    }


# ─────────────────────────────────────────────────
# DISCOUNT SUMMARY (daily + location breakdown)
# ─────────────────────────────────────────────────


@router.get("/analytics/discount-summary", response_model=Dict[str, Any])
async def get_discount_summary(
    days: int = Query(60, ge=1, le=365),
    location_ids: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    date_preset: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get discount summary with daily and location breakdowns."""
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    filtered = ctx["location_ids"]
    cat_ids = ctx["catalog_object_ids"] if ctx["mode"] == "category" else None
    start, end = _resolve_date_range(date_preset, start_date, end_date, days)

    if not filtered or (cat_ids is not None and not cat_ids):
        return {"total_discounts": 0, "total_sales": 0, "discount_rate": 0, "total_transactions": 0, "daily": [], "by_location": [], "by_code": [], "currency": "GBP"}

    base = _base_sales_filter(filtered, start, end, completed_only=False)

    # ── category mode: iterate transactions and filter by line_items ──
    if cat_ids is not None:
        from app.services.exchange_rate_service import exchange_rate_service as _fx_cat

        rows = db.query(
            SalesTransaction.transaction_date,
            SalesTransaction.total_discount_amount,
            SalesTransaction.amount_money_amount,
            SalesTransaction.amount_money_currency,
            SalesTransaction.location_id,
            SalesTransaction.raw_data,
        ).filter(base).yield_per(500)

        # Build location name lookup
        loc_name_map = {str(loc.id): loc.name for loc in db.query(Location.id, Location.name).filter(Location.id.in_(filtered)).all()}

        # Collect all currencies first pass isn't needed — collect during iteration
        all_currencies: set = set()
        matched_txns = []
        for txn_date, disc_amt, sale_amt, curr, loc_id, raw_data_json in rows:
            line_items = raw_data_json.get("line_items", []) if raw_data_json else []
            if not _txn_matches_category(line_items, cat_ids):
                continue
            cur = curr or "GBP"
            all_currencies.add(cur)
            matched_txns.append((txn_date, int(disc_amt or 0), int(sale_amt or 0), cur, str(loc_id), raw_data_json))

        rates, _ = _fx_cat.get_rates_to_gbp(db, current_user.organization_id, all_currencies or {"GBP"})

        total_discounts = 0
        total_sales = 0
        total_transactions = 0
        daily_agg: Dict[str, Dict[str, int]] = {}
        loc_agg: Dict[str, dict] = {}
        disc_cur_bk: Dict[str, dict] = {}
        discount_code_stats: Dict[str, Dict[str, Any]] = {}

        for txn_date, disc_val, sale_val, cur, loc_id, raw_data_json in matched_txns:
            rate = rates.get(cur, 1.0)
            conv_disc = round(disc_val * rate)
            conv_sale = round(sale_val * rate)

            total_discounts += conv_disc
            total_sales += conv_sale
            total_transactions += 1

            # Currency breakdown
            if cur not in disc_cur_bk:
                disc_cur_bk[cur] = {"currency": cur, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
            disc_cur_bk[cur]["amount"] += disc_val
            disc_cur_bk[cur]["converted_amount"] += conv_disc

            # Daily
            d_key = txn_date.date().isoformat() if hasattr(txn_date, "date") else str(txn_date)[:10]
            if d_key not in daily_agg:
                daily_agg[d_key] = {"discounts": 0, "sales": 0, "transactions": 0}
            daily_agg[d_key]["discounts"] += conv_disc
            daily_agg[d_key]["sales"] += conv_sale
            daily_agg[d_key]["transactions"] += 1

            # By location
            if loc_id not in loc_agg:
                loc_agg[loc_id] = {"location_id": loc_id, "location_name": loc_name_map.get(loc_id, "Unknown"), "discounts": 0, "sales": 0, "transactions": 0}
            loc_agg[loc_id]["discounts"] += conv_disc
            loc_agg[loc_id]["sales"] += conv_sale
            loc_agg[loc_id]["transactions"] += 1

            # Parse discount codes
            if raw_data_json and disc_val > 0:
                for disc in raw_data_json.get("discounts", []):
                    name = disc.get("name") or "Unnamed Discount"
                    disc_type = disc.get("type", "UNKNOWN")
                    applied = round(disc.get("applied_money", {}).get("amount", 0) * rate)
                    percentage = disc.get("percentage")
                    if name not in discount_code_stats:
                        discount_code_stats[name] = {"name": name, "type": disc_type, "percentage": percentage, "total_amount": 0, "usage_count": 0}
                    discount_code_stats[name]["total_amount"] += applied
                    discount_code_stats[name]["usage_count"] += 1

        daily = sorted(
            [{"date": k, "discounts": v["discounts"], "sales": v["sales"], "transactions": v["transactions"]} for k, v in daily_agg.items()],
            key=lambda x: x["date"],
        )
        by_code = sorted(discount_code_stats.values(), key=lambda x: x["total_amount"], reverse=True)
        by_location = sorted(loc_agg.values(), key=lambda x: x["discounts"], reverse=True)

        return {
            "total_discounts": total_discounts,
            "total_sales": total_sales,
            "total_transactions": total_transactions,
            "discount_rate": round((total_discounts / total_sales * 100) if total_sales > 0 else 0, 2),
            "daily": daily,
            "by_location": by_location,
            "by_code": by_code,
            "currency": "GBP",
            "by_currency": list(disc_cur_bk.values()) if disc_cur_bk and any(c != "GBP" for c in disc_cur_bk) else None,
        }

    # ── location mode: SQL aggregation with multi-currency conversion ──
    from app.services.exchange_rate_service import exchange_rate_service as _fx

    totals_rows = db.query(
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.total_discount_amount).label("total_discounts"),
        func.sum(SalesTransaction.amount_money_amount).label("total_sales"),
        func.count(SalesTransaction.id).label("total_transactions"),
    ).filter(base).group_by(SalesTransaction.amount_money_currency).all()

    all_cur = {r.amount_money_currency or "GBP" for r in totals_rows}

    # Daily grouped by currency
    daily_rows = db.query(
        func.date(SalesTransaction.transaction_date).label("date"),
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.total_discount_amount).label("discounts"),
        func.sum(SalesTransaction.amount_money_amount).label("sales"),
        func.count(SalesTransaction.id).label("transactions"),
    ).filter(base).group_by(func.date(SalesTransaction.transaction_date), SalesTransaction.amount_money_currency).order_by(func.date(SalesTransaction.transaction_date)).all()

    for r in daily_rows:
        all_cur.add(r.amount_money_currency or "GBP")

    # By location grouped by currency
    loc_rows = db.query(
        Location.id.label("location_id"),
        Location.name.label("location_name"),
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.total_discount_amount).label("discounts"),
        func.sum(SalesTransaction.amount_money_amount).label("sales"),
        func.count(SalesTransaction.id).label("transactions"),
    ).join(Location, SalesTransaction.location_id == Location.id).filter(base).group_by(Location.id, Location.name, SalesTransaction.amount_money_currency).all()

    for r in loc_rows:
        all_cur.add(r.amount_money_currency or "GBP")

    rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

    total_discounts = 0
    total_sales = 0
    total_transactions = 0
    disc_cur_bk: Dict[str, dict] = {}
    for row in totals_rows:
        cur = row.amount_money_currency or "GBP"
        rate = rates.get(cur, 1.0)
        raw_disc = int(row.total_discounts or 0)
        conv_disc = round(raw_disc * rate)
        total_discounts += conv_disc
        total_sales += round(int(row.total_sales or 0) * rate)
        total_transactions += int(row.total_transactions or 0)
        if cur not in disc_cur_bk:
            disc_cur_bk[cur] = {"currency": cur, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
        disc_cur_bk[cur]["amount"] += raw_disc
        disc_cur_bk[cur]["converted_amount"] += conv_disc

    # Merge daily across currencies
    daily_map: Dict[str, dict] = {}
    for row in daily_rows:
        dk = row.date.isoformat()
        rate = rates.get(row.amount_money_currency or "GBP", 1.0)
        if dk not in daily_map:
            daily_map[dk] = {"date": dk, "discounts": 0, "sales": 0, "transactions": 0}
        daily_map[dk]["discounts"] += round(int(row.discounts or 0) * rate)
        daily_map[dk]["sales"] += round(int(row.sales or 0) * rate)
        daily_map[dk]["transactions"] += int(row.transactions or 0)
    daily = sorted(daily_map.values(), key=lambda x: x["date"])

    # Merge locations across currencies
    loc_map: Dict[str, dict] = {}
    for row in loc_rows:
        rate = rates.get(row.amount_money_currency or "GBP", 1.0)
        lid = str(row.location_id)
        if lid not in loc_map:
            loc_map[lid] = {"location_id": lid, "location_name": row.location_name, "discounts": 0, "sales": 0, "transactions": 0}
        loc_map[lid]["discounts"] += round(int(row.discounts or 0) * rate)
        loc_map[lid]["sales"] += round(int(row.sales or 0) * rate)
        loc_map[lid]["transactions"] += int(row.transactions or 0)
    by_location = sorted(loc_map.values(), key=lambda x: x["discounts"], reverse=True)

    # By discount code/name – parse from raw_data JSONB
    discount_code_stats: Dict[str, Dict[str, Any]] = {}
    for (raw_data_json, cur) in db.query(
        SalesTransaction.raw_data, SalesTransaction.amount_money_currency
    ).filter(
        base, SalesTransaction.total_discount_amount > 0
    ).yield_per(500):
        if not raw_data_json:
            continue
        rate = rates.get(cur or "GBP", 1.0)
        discounts_list = raw_data_json.get("discounts", [])
        for disc in discounts_list:
            name = disc.get("name") or "Unnamed Discount"
            disc_type = disc.get("type", "UNKNOWN")
            applied = round(disc.get("applied_money", {}).get("amount", 0) * rate)
            percentage = disc.get("percentage")

            if name not in discount_code_stats:
                discount_code_stats[name] = {
                    "name": name,
                    "type": disc_type,
                    "percentage": percentage,
                    "total_amount": 0,
                    "usage_count": 0,
                }
            discount_code_stats[name]["total_amount"] += applied
            discount_code_stats[name]["usage_count"] += 1

    by_code = sorted(discount_code_stats.values(), key=lambda x: x["total_amount"], reverse=True)

    return {
        "total_discounts": total_discounts,
        "total_sales": total_sales,
        "total_transactions": total_transactions,
        "discount_rate": round((total_discounts / total_sales * 100) if total_sales > 0 else 0, 2),
        "daily": daily,
        "by_location": by_location,
        "by_code": by_code,
        "currency": "GBP",
        "by_currency": list(disc_cur_bk.values()) if disc_cur_bk and any(c != "GBP" for c in disc_cur_bk) else None,
    }


# ─────────────────────────────────────────────────
# TIPS SUMMARY (daily + location + by method)
# ─────────────────────────────────────────────────


@router.get("/analytics/tips-summary", response_model=Dict[str, Any])
async def get_tips_summary(
    days: int = Query(60, ge=1, le=365),
    location_ids: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    date_preset: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get tips summary with daily, location, and payment method breakdowns."""
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    filtered = ctx["location_ids"]
    cat_ids = ctx["catalog_object_ids"] if ctx["mode"] == "category" else None
    start, end = _resolve_date_range(date_preset, start_date, end_date, days)

    if not filtered or (cat_ids is not None and not cat_ids):
        return {"total_tips": 0, "total_sales": 0, "tip_rate": 0, "total_transactions": 0, "tipped_transactions": 0, "daily": [], "by_location": [], "by_method": [], "currency": "GBP"}

    base = _base_sales_filter(filtered, start, end, completed_only=False)

    # ── category mode: iterate transactions and filter by line_items ──
    if cat_ids is not None:
        from app.services.exchange_rate_service import exchange_rate_service as _fx_tips_cat

        loc_name_map = {str(loc.id): loc.name for loc in db.query(Location.id, Location.name).filter(Location.id.in_(filtered)).all()}

        # First pass: collect matched transactions and currencies
        matched_tips = []
        all_cur_tips: set = set()
        for txn_date, tip_amt, sale_amt, curr, tender, loc_id, raw_data_json in db.query(
            SalesTransaction.transaction_date,
            SalesTransaction.total_tip_amount,
            SalesTransaction.amount_money_amount,
            SalesTransaction.amount_money_currency,
            SalesTransaction.tender_type,
            SalesTransaction.location_id,
            SalesTransaction.raw_data,
        ).filter(base).yield_per(500):
            line_items = raw_data_json.get("line_items", []) if raw_data_json else []
            if not _txn_matches_category(line_items, cat_ids):
                continue
            cur = curr or "GBP"
            all_cur_tips.add(cur)
            matched_tips.append((txn_date, int(tip_amt or 0), int(sale_amt or 0), cur, tender, str(loc_id)))

        rates_tips, _ = _fx_tips_cat.get_rates_to_gbp(db, current_user.organization_id, all_cur_tips or {"GBP"})

        total_tips = 0
        total_sales = 0
        total_transactions = 0
        tipped_transactions = 0
        daily_agg: Dict[str, Dict[str, int]] = {}
        method_agg: Dict[str, Dict[str, int]] = {}
        loc_agg: Dict[str, Dict[str, Any]] = {}
        tips_cur_bk_cat: Dict[str, dict] = {}

        for txn_date, tip_val, sale_val, cur, tender, loc_id in matched_tips:
            rate = rates_tips.get(cur, 1.0)
            conv_tip = round(tip_val * rate)
            conv_sale = round(sale_val * rate)
            total_tips += conv_tip
            total_sales += conv_sale
            total_transactions += 1
            if tip_val > 0:
                tipped_transactions += 1

            if cur not in tips_cur_bk_cat:
                tips_cur_bk_cat[cur] = {"currency": cur, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
            tips_cur_bk_cat[cur]["amount"] += tip_val
            tips_cur_bk_cat[cur]["converted_amount"] += conv_tip

            d_key = txn_date.date().isoformat() if hasattr(txn_date, "date") else str(txn_date)[:10]
            if d_key not in daily_agg:
                daily_agg[d_key] = {"tips": 0, "sales": 0, "tipped_count": 0}
            daily_agg[d_key]["tips"] += conv_tip
            daily_agg[d_key]["sales"] += conv_sale
            if tip_val > 0:
                daily_agg[d_key]["tipped_count"] += 1

            method = tender or "UNKNOWN"
            if method not in method_agg:
                method_agg[method] = {"tips": 0, "tipped_count": 0}
            method_agg[method]["tips"] += conv_tip
            if tip_val > 0:
                method_agg[method]["tipped_count"] += 1

            if loc_id not in loc_agg:
                loc_agg[loc_id] = {"location_id": loc_id, "location_name": loc_name_map.get(loc_id, "Unknown"), "tips": 0, "sales": 0, "tipped_count": 0}
            loc_agg[loc_id]["tips"] += conv_tip
            loc_agg[loc_id]["sales"] += conv_sale
            if tip_val > 0:
                loc_agg[loc_id]["tipped_count"] += 1

        daily = sorted(
            [{"date": k, "tips": v["tips"], "sales": v["sales"], "tipped_count": v["tipped_count"]} for k, v in daily_agg.items()],
            key=lambda x: x["date"],
        )
        by_method = sorted(
            [{"method": k, "tips": v["tips"], "tipped_count": v["tipped_count"]} for k, v in method_agg.items()],
            key=lambda x: x["tips"], reverse=True,
        )
        by_location = sorted(loc_agg.values(), key=lambda x: x["tips"], reverse=True)

        return {
            "total_tips": total_tips,
            "total_sales": total_sales,
            "total_transactions": total_transactions,
            "tipped_transactions": tipped_transactions,
            "tip_rate": round((total_tips / total_sales * 100) if total_sales > 0 else 0, 2),
            "daily": daily,
            "by_location": by_location,
            "by_method": by_method,
            "currency": "GBP",
            "by_currency": list(tips_cur_bk_cat.values()) if tips_cur_bk_cat and any(c != "GBP" for c in tips_cur_bk_cat) else None,
        }

    # ── location mode: SQL aggregation with multi-currency conversion ──
    from app.services.exchange_rate_service import exchange_rate_service as _fx

    totals_rows = db.query(
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.total_tip_amount).label("total_tips"),
        func.sum(SalesTransaction.amount_money_amount).label("total_sales"),
        func.count(SalesTransaction.id).label("total_transactions"),
        func.count(SalesTransaction.id).filter(SalesTransaction.total_tip_amount > 0).label("tipped_transactions"),
    ).filter(base).group_by(SalesTransaction.amount_money_currency).all()

    all_cur = {r.amount_money_currency or "GBP" for r in totals_rows}

    # Daily grouped by currency
    daily_rows = db.query(
        func.date(SalesTransaction.transaction_date).label("date"),
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.total_tip_amount).label("tips"),
        func.sum(SalesTransaction.amount_money_amount).label("sales"),
        func.count(SalesTransaction.id).filter(SalesTransaction.total_tip_amount > 0).label("tipped_count"),
    ).filter(base).group_by(func.date(SalesTransaction.transaction_date), SalesTransaction.amount_money_currency).order_by(func.date(SalesTransaction.transaction_date)).all()

    for r in daily_rows:
        all_cur.add(r.amount_money_currency or "GBP")

    # By location grouped by currency
    loc_rows = db.query(
        Location.name.label("location_name"),
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.total_tip_amount).label("tips"),
        func.sum(SalesTransaction.amount_money_amount).label("sales"),
        func.count(SalesTransaction.id).filter(SalesTransaction.total_tip_amount > 0).label("tipped_count"),
    ).join(Location, SalesTransaction.location_id == Location.id).filter(base).group_by(Location.name, SalesTransaction.amount_money_currency).all()

    for r in loc_rows:
        all_cur.add(r.amount_money_currency or "GBP")

    # By payment method grouped by currency
    method_rows = db.query(
        SalesTransaction.tender_type,
        SalesTransaction.amount_money_currency,
        func.sum(SalesTransaction.total_tip_amount).label("tips"),
        func.count(SalesTransaction.id).filter(SalesTransaction.total_tip_amount > 0).label("tipped_count"),
    ).filter(base).group_by(SalesTransaction.tender_type, SalesTransaction.amount_money_currency).all()

    for r in method_rows:
        all_cur.add(r.amount_money_currency or "GBP")

    rates, _ = _fx.get_rates_to_gbp(db, current_user.organization_id, all_cur or {"GBP"})

    total_tips = 0
    total_sales = 0
    total_transactions = 0
    tipped_transactions = 0
    tips_cur_bk: Dict[str, dict] = {}
    for row in totals_rows:
        cur = row.amount_money_currency or "GBP"
        rate = rates.get(cur, 1.0)
        raw_tips = int(row.total_tips or 0)
        conv_tips = round(raw_tips * rate)
        total_tips += conv_tips
        total_sales += round(int(row.total_sales or 0) * rate)
        total_transactions += int(row.total_transactions or 0)
        tipped_transactions += int(row.tipped_transactions or 0)
        if raw_tips > 0:
            if cur not in tips_cur_bk:
                tips_cur_bk[cur] = {"currency": cur, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
            tips_cur_bk[cur]["amount"] += raw_tips
            tips_cur_bk[cur]["converted_amount"] += conv_tips

    # Merge daily across currencies
    daily_map: Dict[str, dict] = {}
    for row in daily_rows:
        dk = row.date.isoformat()
        rate = rates.get(row.amount_money_currency or "GBP", 1.0)
        if dk not in daily_map:
            daily_map[dk] = {"date": dk, "tips": 0, "sales": 0, "tipped_count": 0}
        daily_map[dk]["tips"] += round(int(row.tips or 0) * rate)
        daily_map[dk]["sales"] += round(int(row.sales or 0) * rate)
        daily_map[dk]["tipped_count"] += int(row.tipped_count or 0)
    daily = sorted(daily_map.values(), key=lambda x: x["date"])

    # Merge locations across currencies
    loc_map: Dict[str, dict] = {}
    for row in loc_rows:
        rate = rates.get(row.amount_money_currency or "GBP", 1.0)
        if row.location_name not in loc_map:
            loc_map[row.location_name] = {"location_name": row.location_name, "tips": 0, "sales": 0, "tipped_count": 0}
        loc_map[row.location_name]["tips"] += round(int(row.tips or 0) * rate)
        loc_map[row.location_name]["sales"] += round(int(row.sales or 0) * rate)
        loc_map[row.location_name]["tipped_count"] += int(row.tipped_count or 0)
    by_location = sorted(loc_map.values(), key=lambda x: x["tips"], reverse=True)

    # Merge methods across currencies
    method_map: Dict[str, dict] = {}
    for row in method_rows:
        m = row.tender_type or "UNKNOWN"
        rate = rates.get(row.amount_money_currency or "GBP", 1.0)
        if m not in method_map:
            method_map[m] = {"method": m, "tips": 0, "tipped_count": 0}
        method_map[m]["tips"] += round(int(row.tips or 0) * rate)
        method_map[m]["tipped_count"] += int(row.tipped_count or 0)
    by_method = sorted(method_map.values(), key=lambda x: x["tips"], reverse=True)

    return {
        "total_tips": total_tips,
        "total_sales": total_sales,
        "total_transactions": total_transactions,
        "tipped_transactions": tipped_transactions,
        "tip_rate": round((total_tips / total_sales * 100) if total_sales > 0 else 0, 2),
        "daily": daily,
        "by_location": by_location,
        "by_method": by_method,
        "currency": "GBP",
        "by_currency": list(tips_cur_bk.values()) if tips_cur_bk and any(c != "GBP" for c in tips_cur_bk) else None,
    }


# ─────────────────────────────────────────────────
# DAILY SALES SUMMARY — pre-aggregated analytics
# ─────────────────────────────────────────────────

from app.models.daily_sales_summary import DailySalesSummary
from collections import defaultdict
from app.services.exchange_rate_service import exchange_rate_service
import uuid as uuid_lib
from datetime import date as date_type
from app.services.summary_service import rebuild_daily_summaries_for_locations


@router.post("/summary/rebuild", response_model=Dict[str, Any])
async def rebuild_daily_summaries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Rebuild the daily_sales_summary table from sales_transactions.
    Uses SQL aggregation for core metrics, then a lightweight scan for line_items only.
    """
    if current_user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin only")

    accessible = get_accessible_locations(db, current_user)
    if not accessible:
        return {"message": "No locations", "summaries_created": 0}

    created = rebuild_daily_summaries_for_locations(db, accessible)
    return {"message": f"Rebuilt {created} daily summaries", "summaries_created": created}


@router.get("/analytics/fast-summary", response_model=Dict[str, Any])
async def get_fast_analytics(
    date_preset: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    days: int = Query(60, ge=1, le=3650),
    location_ids: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fast analytics from pre-aggregated daily_sales_summary table.
    Returns all data the Analytics page needs in a single response.
    In category mode (client with keywords), falls back to transaction-level
    queries and filters by matching products.
    """
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    start, end = _resolve_date_range(date_preset, start_date, end_date, days)

    if not ctx["location_ids"]:
        return _empty_fast_summary()

    # Category mode: compute from transactions with product-level filtering
    if ctx["mode"] == "category":
        return await _fast_summary_category_mode(db, current_user, ctx, start, end)

    filtered = ctx["location_ids"]

    # Query summary table — typically < 3000 rows even for a full year
    rows = db.query(DailySalesSummary).filter(
        DailySalesSummary.location_id.in_(filtered),
        DailySalesSummary.date >= start.date() if isinstance(start, datetime) else start,
        DailySalesSummary.date <= end.date() if isinstance(end, datetime) else end,
    ).all()

    if not rows:
        return _empty_fast_summary()

    # --- Exchange rates: convert all amounts to GBP ---
    all_currencies = set(row.currency for row in rows)
    rates_to_gbp, rates_live = exchange_rate_service.get_rates_to_gbp(db, current_user.organization_id, all_currencies)
    rates_warning = None if rates_live else "Exchange rates unavailable - amounts shown without conversion"

    # Aggregate across all rows (converting to GBP)
    total_sales = 0
    total_transactions = 0
    total_items = 0
    total_tax = 0
    total_tips = 0
    total_discounts = 0
    total_refund_amount = 0
    total_refund_count = 0
    by_tender = defaultdict(int)
    by_hour_agg = defaultdict(lambda: {"sales": 0, "transactions": 0, "items": 0})
    by_day: Dict[str, dict] = {}
    by_location: Dict[str, dict] = {}
    product_agg: Dict[str, dict] = defaultdict(lambda: {"qty": 0, "revenue": 0, "tx": 0})
    currency_breakdown: Dict[str, dict] = {}
    refund_currency_breakdown: Dict[str, dict] = {}
    discount_currency_breakdown: Dict[str, dict] = {}
    tax_currency_breakdown: Dict[str, dict] = {}

    for row in rows:
        rate = rates_to_gbp.get(row.currency, 1.0)
        converted_sales = round(row.total_sales * rate)
        converted_tax = round(row.total_tax * rate)
        converted_tips = round(row.total_tips * rate)
        converted_discounts = round(row.total_discounts * rate)
        converted_refunds = round(row.total_refund_amount * rate)

        total_sales += converted_sales
        total_transactions += row.transaction_count
        total_items += row.total_items
        total_tax += converted_tax
        total_tips += converted_tips
        total_discounts += converted_discounts
        total_refund_amount += converted_refunds
        total_refund_count += row.refund_count

        # Track per-currency breakdown
        curr = row.currency
        if curr not in currency_breakdown:
            currency_breakdown[curr] = {"currency": curr, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
        currency_breakdown[curr]["amount"] += row.total_sales
        currency_breakdown[curr]["converted_amount"] += converted_sales

        # Track discount per-currency breakdown
        if row.total_discounts and row.total_discounts > 0:
            if curr not in discount_currency_breakdown:
                discount_currency_breakdown[curr] = {"currency": curr, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
            discount_currency_breakdown[curr]["amount"] += row.total_discounts
            discount_currency_breakdown[curr]["converted_amount"] += converted_discounts

        # Track tax per-currency breakdown
        if row.total_tax and row.total_tax > 0:
            if curr not in tax_currency_breakdown:
                tax_currency_breakdown[curr] = {"currency": curr, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
            tax_currency_breakdown[curr]["amount"] += row.total_tax
            tax_currency_breakdown[curr]["converted_amount"] += converted_tax

        # Track refund per-currency breakdown
        if row.total_refund_amount and row.total_refund_amount > 0:
            if curr not in refund_currency_breakdown:
                refund_currency_breakdown[curr] = {"currency": curr, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
            refund_currency_breakdown[curr]["amount"] += row.total_refund_amount
            refund_currency_breakdown[curr]["converted_amount"] += converted_refunds

        # Tender type (convert to GBP)
        for tender, amt in (row.by_tender_type or {}).items():
            by_tender[tender] += round(amt * rate)

        # Hourly (convert to GBP)
        for hour, data in (row.by_hour or {}).items():
            by_hour_agg[hour]["sales"] += round(data.get("sales", 0) * rate)
            by_hour_agg[hour]["transactions"] += data.get("tx", 0)
            by_hour_agg[hour]["items"] += data.get("items", 0)

        # Daily (convert to GBP)
        day_str = row.date.isoformat()
        if day_str not in by_day:
            by_day[day_str] = {"date": day_str, "total_sales": 0, "transaction_count": 0}
        by_day[day_str]["total_sales"] += converted_sales
        by_day[day_str]["transaction_count"] += row.transaction_count

        # By location (keep native currency + add GBP converted)
        loc_id = str(row.location_id)
        if loc_id not in by_location:
            by_location[loc_id] = {
                "location_id": loc_id, "location_name": "", "total_sales": 0,
                "total_transactions": 0, "currency": row.currency,
                "converted_total_sales": 0, "rate_to_gbp": round(rate, 6),
            }
        by_location[loc_id]["total_sales"] += row.total_sales
        by_location[loc_id]["converted_total_sales"] += converted_sales
        by_location[loc_id]["total_transactions"] += row.transaction_count

        # Products (convert revenue to GBP)
        for prod in (row.top_products or []):
            name = prod.get("name", "Unknown")
            product_agg[name]["qty"] += prod.get("qty", 0)
            product_agg[name]["revenue"] += round(prod.get("revenue", 0) * rate)
            product_agg[name]["tx"] += 1

    # Resolve location names
    loc_ids = list(by_location.keys())
    if loc_ids:
        loc_names = db.query(Location.id, Location.name).filter(Location.id.in_(loc_ids)).all()
        name_map = {str(lid): lname for lid, lname in loc_names}
        for loc_id, data in by_location.items():
            data["location_name"] = name_map.get(loc_id, "Unknown")
            data["average_transaction"] = round(data["converted_total_sales"] / data["total_transactions"]) if data["total_transactions"] > 0 else 0

    # Build hourly array (0-23) — average per day so values are comparable across date ranges
    num_days = max(len(by_day), 1)
    hourly = [
        {
            "hour": h,
            "sales": round(by_hour_agg.get(str(h), {}).get("sales", 0) / num_days),
            "transactions": round(by_hour_agg.get(str(h), {}).get("transactions", 0) / num_days),
            "items": round(by_hour_agg.get(str(h), {}).get("items", 0) / num_days),
        }
        for h in range(24)
    ]

    # Top products
    top_products = sorted(
        [
            {
                "product_name": name,
                "total_quantity": d["qty"],
                "total_revenue": d["revenue"],
                "transaction_count": d["tx"],
                "average_price": round(d["revenue"] / d["qty"]) if d["qty"] > 0 else 0,
            }
            for name, d in product_agg.items()
        ],
        key=lambda x: x["total_revenue"], reverse=True
    )[:20]

    # Daily sorted
    daily_sorted = sorted(by_day.values(), key=lambda x: x["date"])

    avg_transaction = round(total_sales / total_transactions) if total_transactions > 0 else 0
    avg_order_value = avg_transaction
    avg_items_per_order = round(total_items / total_transactions, 2) if total_transactions > 0 else 0

    # Build exchange rates dict for response (only non-GBP)
    exchange_rates_resp = {k: round(v, 6) for k, v in rates_to_gbp.items() if k != "GBP"}

    result = {
        "aggregation": {
            "total_sales": total_sales,
            "total_transactions": total_transactions,
            "average_transaction": avg_transaction,
            "currency": "GBP",
            "start_date": start.isoformat() if isinstance(start, datetime) else str(start),
            "end_date": end.isoformat() if isinstance(end, datetime) else str(end),
            "by_currency": list(currency_breakdown.values()),
        },
        "summary": {
            "total_sales": total_sales,
            "transaction_count": total_transactions,
            "average_transaction": avg_transaction,
            "currency": "GBP",
            "by_tender_type": dict(by_tender),
            "by_status": {"COMPLETED": total_transactions},
            "top_days": daily_sorted,
        },
        "basket": {
            "average_order_value": avg_order_value,
            "average_items_per_order": avg_items_per_order,
            "total_orders": total_transactions,
            "total_items": total_items,
            "currency": "GBP",
        },
        "hourly": hourly,
        "top_products": top_products,
        "refunds": {
            "total_refunds": total_refund_count,
            "total_refund_amount": total_refund_amount,
            "refund_rate": round((total_refund_count / total_transactions * 100) if total_transactions > 0 else 0, 2),
            "currency": "GBP",
            "by_currency": list(refund_currency_breakdown.values()),
        },
        "discounts": {
            "total_discounts": total_discounts,
            "currency": "GBP",
            "by_currency": list(discount_currency_breakdown.values()),
        },
        "tax": {
            "total_tax": total_tax,
            "total_tips": total_tips,
            "currency": "GBP",
            "by_currency": list(tax_currency_breakdown.values()),
        },
        "sales_by_location": sorted(by_location.values(), key=lambda x: x["converted_total_sales"], reverse=True),
        "exchange_rates": exchange_rates_resp,
    }
    if rates_warning:
        result["rates_warning"] = rates_warning
    return result


@router.get("/exchange-rates", response_model=Dict[str, Any])
async def get_exchange_rates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return current exchange rates to GBP for frontend use."""
    rates, has_rates = exchange_rate_service.get_gbp_based_rates(db, current_user.organization_id)
    if not rates:
        return {"rates": {}, "base": "GBP", "warning": "No exchange rates configured"}

    # rates[X] = units of X per 1 GBP — invert to get rate_to_gbp
    gbp_rates = {}
    for curr, gbp_to_curr in rates.items():
        if curr == "GBP":
            continue
        gbp_rates[curr] = round((1.0 / gbp_to_curr) if gbp_to_curr != 0 else 1.0, 6)

    return {"rates": gbp_rates, "base": "GBP"}


async def _fast_summary_category_mode(
    db: Session,
    current_user,
    ctx: dict,
    start: datetime,
    end: datetime,
) -> dict:
    """Compute fast-summary analytics by filtering at the product level.

    Used when a client has category_keywords. Scans transactions and only
    counts line items whose catalog_object_id is in the pre-computed set.
    """
    location_ids = ctx["location_ids"]
    cat_ids = ctx["catalog_object_ids"]

    if not cat_ids:
        result = _empty_fast_summary()
        result["category_filtered"] = True
        return result

    base = _base_sales_filter(location_ids, start, end, completed_only=False)

    # Build artist lookup for by-artist reporting
    account_ids = [
        str(r[0]) for r in db.query(SquareAccount.id).filter(
            SquareAccount.organization_id == current_user.organization_id
        ).all()
    ]
    artist_lookup: Dict[str, str] = {}
    if account_ids:
        for row in db.query(
            CatalogItemCategory.catalog_object_id,
            CatalogItemCategory.artist_name,
        ).filter(
            CatalogItemCategory.square_account_id.in_(account_ids),
            CatalogItemCategory.artist_name.isnot(None),
        ).all():
            artist_lookup[row[0]] = row[1]

    # Exchange rates
    all_currencies = set()
    sample_rows = db.query(SalesTransaction.amount_money_currency).filter(base).distinct().all()
    for (curr,) in sample_rows:
        all_currencies.add(curr)
    rates_to_gbp, rates_live = exchange_rate_service.get_rates_to_gbp(db, current_user.organization_id, all_currencies or {"GBP"})
    rates_warning = None if rates_live else "Exchange rates unavailable - amounts shown without conversion"

    # Scan transactions, filter at line-item level
    total_sales = 0
    total_discounts = 0
    total_tax = 0
    total_transactions_with_match = 0
    total_items = 0
    total_refund_amount = 0
    total_refund_count = 0
    discount_currency_breakdown: Dict[str, dict] = {}
    tax_currency_breakdown: Dict[str, dict] = {}
    by_day: Dict[str, dict] = {}
    by_location: Dict[str, dict] = {}
    product_agg: Dict[str, dict] = defaultdict(lambda: {"qty": 0, "revenue": 0, "tx": 0})
    artist_agg: Dict[str, dict] = defaultdict(lambda: {"revenue": 0, "quantity": 0, "transaction_count": 0})
    currency_breakdown: Dict[str, dict] = {}
    refund_currency_breakdown: Dict[str, dict] = {}
    by_hour_agg: Dict[int, dict] = defaultdict(lambda: {"sales": 0, "transactions": 0, "items": 0})
    seen_txn_ids: set = set()

    for (txn_id, txn_date, loc_id, currency, line_items_json, order_amount, order_discount, order_tax) in db.query(
        SalesTransaction.id,
        SalesTransaction.transaction_date,
        SalesTransaction.location_id,
        SalesTransaction.amount_money_currency,
        SalesTransaction.line_items,
        SalesTransaction.amount_money_amount,
        SalesTransaction.total_discount_amount,
        SalesTransaction.total_tax_amount,
    ).filter(base).yield_per(500):
        if not line_items_json:
            continue

        rate = rates_to_gbp.get(currency, 1.0)
        txn_has_match = False

        for item in line_items_json:
            obj_id = item.get("catalog_object_id", "")
            if obj_id not in cat_ids:
                continue

            txn_has_match = True
            name = item.get("name", "Unknown")
            quantity = int(item.get("quantity", "1"))
            item_revenue = (item.get("total_money") or {}).get("amount", 0)
            item_gross = (item.get("gross_sales_money") or {}).get("amount", 0)
            converted_revenue = round(item_revenue * rate)
            total_items += quantity
            item_hour = txn_date.hour if isinstance(txn_date, datetime) else 0
            by_hour_agg[item_hour]["items"] += quantity

            # Products
            product_agg[name]["qty"] += quantity
            product_agg[name]["revenue"] += converted_revenue
            product_agg[name]["tx"] += 1

            # Artist
            artist = artist_lookup.get(obj_id)
            if artist:
                artist_agg[artist]["revenue"] += converted_revenue
                artist_agg[artist]["quantity"] += quantity
                artist_agg[artist]["transaction_count"] += 1

        if txn_has_match:
            txn_key = str(txn_id)
            if txn_key not in seen_txn_ids:
                seen_txn_ids.add(txn_key)
                total_transactions_with_match += 1

                # Use order-level amount_money_amount for Total Sales
                # This is the net collected amount and already deducts returns
                order_amt = order_amount or 0
                converted_order = round(order_amt * rate)
                total_sales += converted_order

                # Use order-level total_discount_amount for Discounts
                # This captures ALL discounts (line-item + order-level)
                txn_discount = order_discount or 0
                converted_discount = round(txn_discount * rate)
                total_discounts += converted_discount

                # Tax
                txn_tax = order_tax or 0
                converted_tax = round(txn_tax * rate)
                total_tax += converted_tax

                # Per-currency tax breakdown
                if txn_tax > 0:
                    if currency not in tax_currency_breakdown:
                        tax_currency_breakdown[currency] = {"currency": currency, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
                    tax_currency_breakdown[currency]["amount"] += txn_tax
                    tax_currency_breakdown[currency]["converted_amount"] += converted_tax

                # Per-currency breakdown (sales)
                if currency not in currency_breakdown:
                    currency_breakdown[currency] = {"currency": currency, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
                currency_breakdown[currency]["amount"] += order_amt
                currency_breakdown[currency]["converted_amount"] += converted_order

                # Per-currency discount breakdown
                if txn_discount > 0:
                    if currency not in discount_currency_breakdown:
                        discount_currency_breakdown[currency] = {"currency": currency, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
                    discount_currency_breakdown[currency]["amount"] += txn_discount
                    discount_currency_breakdown[currency]["converted_amount"] += converted_discount

                # Daily
                day_str = txn_date.date().isoformat() if isinstance(txn_date, datetime) else str(txn_date)
                if day_str not in by_day:
                    by_day[day_str] = {"date": day_str, "total_sales": 0, "transaction_count": 0}
                by_day[day_str]["total_sales"] += converted_order
                by_day[day_str]["transaction_count"] += 1

                # Location
                loc_str = str(loc_id)
                if loc_str not in by_location:
                    by_location[loc_str] = {
                        "location_id": loc_str, "location_name": "", "total_sales": 0,
                        "total_transactions": 0, "currency": currency,
                        "converted_total_sales": 0, "rate_to_gbp": round(rate, 6),
                    }
                by_location[loc_str]["total_sales"] += order_amt
                by_location[loc_str]["converted_total_sales"] += converted_order
                by_location[loc_str]["total_transactions"] += 1

                # Hourly
                txn_hour = txn_date.hour if isinstance(txn_date, datetime) else 0
                by_hour_agg[txn_hour]["sales"] += converted_order
                by_hour_agg[txn_hour]["transactions"] += 1

    # Fetch returns data (merchandise returns) scoped to matched locations.
    # Uses raw_data->'returns' which captures ALL returns including exchanges,
    # not just raw_data->'refunds' which only captures monetary refunds.
    matched_location_ids = list(by_location.keys())
    return_rows = []
    if matched_location_ids:
        return_rows = db.query(
            SalesTransaction.amount_money_currency,
            SalesTransaction.raw_data["returns"],
        ).filter(
            SalesTransaction.location_id.in_(matched_location_ids),
            SalesTransaction.transaction_date >= start,
            SalesTransaction.transaction_date <= end,
            SalesTransaction.raw_data["returns"] != None,  # noqa: E711
        ).all()
    for (rcurrency, returns_json) in return_rows:
        if not returns_json or not isinstance(returns_json, list):
            continue
        rate = rates_to_gbp.get(rcurrency, 1.0)
        for ret in returns_json:
            return_amounts = ret.get("return_amounts") or {}
            total_money = (return_amounts.get("total_money") or {}).get("amount", 0)
            tax_money = (return_amounts.get("tax_money") or {}).get("amount", 0)
            return_amt = total_money - tax_money  # ex-tax to match Square Dashboard
            if return_amt > 0:
                converted_return = round(return_amt * rate)
                total_refund_amount += converted_return
                total_refund_count += 1
                if rcurrency not in refund_currency_breakdown:
                    refund_currency_breakdown[rcurrency] = {"currency": rcurrency, "amount": 0, "converted_amount": 0, "rate": round(rate, 6)}
                refund_currency_breakdown[rcurrency]["amount"] += return_amt
                refund_currency_breakdown[rcurrency]["converted_amount"] += converted_return

    # Resolve location names
    loc_ids = list(by_location.keys())
    if loc_ids:
        loc_names = db.query(Location.id, Location.name).filter(Location.id.in_(loc_ids)).all()
        name_map = {str(lid): lname for lid, lname in loc_names}
        for loc_id_str, data in by_location.items():
            data["location_name"] = name_map.get(loc_id_str, "Unknown")
            data["average_transaction"] = round(data["converted_total_sales"] / data["total_transactions"]) if data["total_transactions"] > 0 else 0

    avg_transaction = round(total_sales / total_transactions_with_match) if total_transactions_with_match > 0 else 0
    avg_items = round(total_items / total_transactions_with_match, 2) if total_transactions_with_match > 0 else 0

    top_products = sorted(
        [
            {
                "product_name": name,
                "total_quantity": d["qty"],
                "total_revenue": d["revenue"],
                "transaction_count": d["tx"],
                "average_price": round(d["revenue"] / d["qty"]) if d["qty"] > 0 else 0,
            }
            for name, d in product_agg.items()
        ],
        key=lambda x: x["total_revenue"], reverse=True
    )[:20]

    by_artist = sorted(
        [
            {"artist_name": name, **data}
            for name, data in artist_agg.items()
        ],
        key=lambda x: x["revenue"], reverse=True
    )

    daily_sorted = sorted(by_day.values(), key=lambda x: x["date"])
    exchange_rates_resp = {k: round(v, 6) for k, v in rates_to_gbp.items() if k != "GBP"}

    # Build hourly array (0-23) — average per day so values are comparable across date ranges
    num_days = max(len(by_day), 1)
    hourly = [
        {
            "hour": h,
            "sales": round(by_hour_agg.get(h, {}).get("sales", 0) / num_days),
            "transactions": round(by_hour_agg.get(h, {}).get("transactions", 0) / num_days),
            "items": round(by_hour_agg.get(h, {}).get("items", 0) / num_days),
        }
        for h in range(24)
    ]

    result = {
        "aggregation": {
            "total_sales": total_sales,
            "total_transactions": total_transactions_with_match,
            "average_transaction": avg_transaction,
            "currency": "GBP",
            "start_date": start.isoformat() if isinstance(start, datetime) else str(start),
            "end_date": end.isoformat() if isinstance(end, datetime) else str(end),
            "by_currency": list(currency_breakdown.values()),
        },
        "summary": {
            "total_sales": total_sales,
            "transaction_count": total_transactions_with_match,
            "average_transaction": avg_transaction,
            "currency": "GBP",
            "by_tender_type": {},
            "by_status": {"COMPLETED": total_transactions_with_match},
            "top_days": daily_sorted,
        },
        "basket": {
            "average_order_value": avg_transaction,
            "average_items_per_order": avg_items,
            "total_orders": total_transactions_with_match,
            "total_items": total_items,
            "currency": "GBP",
        },
        "hourly": hourly,
        "top_products": top_products,
        "refunds": {
            "total_refunds": total_refund_count,
            "total_refund_amount": total_refund_amount,
            "refund_rate": round((total_refund_count / total_transactions_with_match * 100) if total_transactions_with_match > 0 else 0, 2),
            "currency": "GBP",
            "by_currency": list(refund_currency_breakdown.values()),
        },
        "discounts": {
            "total_discounts": total_discounts,
            "currency": "GBP",
            "by_currency": list(discount_currency_breakdown.values()),
        },
        "tax": {
            "total_tax": total_tax,
            "total_tips": 0,
            "currency": "GBP",
            "by_currency": list(tax_currency_breakdown.values()),
        },
        "sales_by_location": sorted(by_location.values(), key=lambda x: x["converted_total_sales"], reverse=True),
        "by_artist": by_artist,
        "exchange_rates": exchange_rates_resp,
        "category_filtered": True,
    }
    if rates_warning:
        result["rates_warning"] = rates_warning
    return result


def _empty_fast_summary():
    return {
        "aggregation": {"total_sales": 0, "total_transactions": 0, "average_transaction": 0, "currency": "GBP", "start_date": "", "end_date": "", "by_currency": []},
        "summary": {"total_sales": 0, "transaction_count": 0, "average_transaction": 0, "currency": "GBP", "by_tender_type": {}, "by_status": {}, "top_days": []},
        "basket": {"average_order_value": 0, "average_items_per_order": 0, "total_orders": 0, "total_items": 0, "currency": "GBP"},
        "hourly": [{"hour": h, "sales": 0, "transactions": 0, "items": 0} for h in range(24)],
        "top_products": [],
        "refunds": {"total_refunds": 0, "total_refund_amount": 0, "refund_rate": 0, "currency": "GBP", "by_currency": []},
        "discounts": {"total_discounts": 0, "currency": "GBP"},
        "tax": {"total_tax": 0, "total_tips": 0, "currency": "GBP"},
        "sales_by_location": [],
        "exchange_rates": {},
    }


# ─────────────────────────────────────────────────
# SALES BY ARTIST
# ─────────────────────────────────────────────────


@router.get("/analytics/by-artist", response_model=List[Dict[str, Any]])
async def get_sales_by_artist(
    days: int = Query(60, ge=1, le=3650),
    location_ids: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    date_preset: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get sales aggregated by artist (second-level category in hierarchy).
    Returns artist breakdown with revenue, quantity, and transaction count.
    """
    accessible = get_accessible_locations(db, current_user)
    client_id = _effective_client_id(current_user, client_id, db)
    allowed = _get_allowed_client_ids(current_user, db)
    ctx = _get_client_filter_context(db, accessible, client_id, location_ids, allowed)
    start, end = _resolve_date_range(date_preset, start_date, end_date, days)

    if not ctx["location_ids"]:
        return []

    # Build catalog_object_id → artist_name lookup
    account_ids = [
        str(r[0]) for r in db.query(SquareAccount.id).filter(
            SquareAccount.organization_id == current_user.organization_id
        ).all()
    ]
    artist_lookup: Dict[str, str] = {}
    if account_ids:
        for row in db.query(
            CatalogItemCategory.catalog_object_id,
            CatalogItemCategory.artist_name,
        ).filter(
            CatalogItemCategory.square_account_id.in_(account_ids),
            CatalogItemCategory.artist_name.isnot(None),
        ).all():
            artist_lookup[row[0]] = row[1]

    if not artist_lookup:
        return []

    base = _base_sales_filter(ctx["location_ids"], start, end, completed_only=False)
    cat_filter = ctx["catalog_object_ids"] if ctx["mode"] == "category" else None

    # Exchange rates
    all_currencies = set()
    for (curr,) in db.query(SalesTransaction.amount_money_currency).filter(base).distinct().all():
        all_currencies.add(curr)
    rates_to_gbp, _ = exchange_rate_service.get_rates_to_gbp(db, current_user.organization_id, all_currencies or {"GBP"})

    artist_stats: Dict[str, dict] = defaultdict(lambda: {"revenue": 0, "quantity": 0, "transaction_count": 0})

    for (currency, line_items_json) in db.query(
        SalesTransaction.amount_money_currency,
        SalesTransaction.line_items,
    ).filter(base).yield_per(500):
        if not line_items_json:
            continue

        rate = rates_to_gbp.get(currency, 1.0)

        for item in line_items_json:
            obj_id = item.get("catalog_object_id", "")

            if cat_filter is not None and obj_id not in cat_filter:
                continue

            artist = artist_lookup.get(obj_id)
            if not artist:
                continue

            quantity = int(item.get("quantity", "1"))
            item_revenue = (item.get("gross_sales_money") or {}).get("amount", 0)
            converted_revenue = round(item_revenue * rate)

            artist_stats[artist]["revenue"] += converted_revenue
            artist_stats[artist]["quantity"] += quantity
            artist_stats[artist]["transaction_count"] += 1

    result = sorted(
        [{"artist_name": name, **data} for name, data in artist_stats.items()],
        key=lambda x: x["revenue"],
        reverse=True,
    )
    return result
