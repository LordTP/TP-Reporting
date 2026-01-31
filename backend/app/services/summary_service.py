"""
Daily Sales Summary rebuild service.
Extracts the rebuild logic so it can be called from both the API endpoint and Celery tasks.
"""
from typing import List, Dict
from collections import defaultdict
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func, text
import uuid as uuid_lib

from app.models.sales_transaction import SalesTransaction
from app.models.daily_sales_summary import DailySalesSummary


def rebuild_daily_summaries_for_locations(db: Session, location_ids: List[str]) -> int:
    """
    Rebuild daily_sales_summary rows for the given location IDs.
    Uses SQL aggregation for speed. Returns number of summaries created.
    """
    if not location_ids:
        return 0

    tx_date_col = func.date(SalesTransaction.transaction_date).label("tx_date")
    hour_col = func.extract("hour", SalesTransaction.transaction_date).label("tx_hour")

    # Step 1: Core metrics via SQL
    core_rows = db.query(
        SalesTransaction.location_id,
        tx_date_col,
        func.sum(SalesTransaction.amount_money_amount).label("total_sales"),
        func.sum(SalesTransaction.total_money_amount).label("total_gross"),
        func.count(SalesTransaction.id).label("transaction_count"),
        func.sum(SalesTransaction.total_tax_amount).label("total_tax"),
        func.sum(SalesTransaction.total_tip_amount).label("total_tips"),
        func.sum(SalesTransaction.total_discount_amount).label("total_discounts"),
        func.min(SalesTransaction.amount_money_currency).label("currency"),
    ).filter(
        SalesTransaction.location_id.in_(location_ids),
        SalesTransaction.payment_status == "COMPLETED",
    ).group_by(
        SalesTransaction.location_id, tx_date_col
    ).all()

    buckets: Dict[tuple, dict] = {}
    for row in core_rows:
        key = (str(row.location_id), row.tx_date)
        buckets[key] = {
            "total_sales": int(row.total_sales or 0),
            "total_gross": int(row.total_gross or 0),
            "transaction_count": int(row.transaction_count or 0),
            "total_items": 0,
            "total_tax": int(row.total_tax or 0),
            "total_tips": int(row.total_tips or 0),
            "total_discounts": int(row.total_discounts or 0),
            "total_refund_amount": 0,
            "refund_count": 0,
            "by_tender_type": {},
            "by_hour": {},
            "top_products": [],
            "currency": row.currency or "GBP",
        }

    # Step 2: Tender type breakdown
    tender_rows = db.query(
        SalesTransaction.location_id,
        tx_date_col,
        SalesTransaction.tender_type,
        func.sum(SalesTransaction.amount_money_amount).label("amount"),
    ).filter(
        SalesTransaction.location_id.in_(location_ids),
        SalesTransaction.payment_status == "COMPLETED",
    ).group_by(
        SalesTransaction.location_id, tx_date_col, SalesTransaction.tender_type
    ).all()

    for row in tender_rows:
        key = (str(row.location_id), row.tx_date)
        if key in buckets:
            tender = row.tender_type or "OTHER"
            buckets[key]["by_tender_type"][tender] = int(row.amount or 0)

    # Step 3: Hourly breakdown
    hourly_rows = db.query(
        SalesTransaction.location_id,
        tx_date_col,
        hour_col,
        func.sum(SalesTransaction.amount_money_amount).label("sales"),
        func.count(SalesTransaction.id).label("tx"),
    ).filter(
        SalesTransaction.location_id.in_(location_ids),
        SalesTransaction.payment_status == "COMPLETED",
    ).group_by(
        SalesTransaction.location_id, tx_date_col, hour_col
    ).all()

    for row in hourly_rows:
        key = (str(row.location_id), row.tx_date)
        if key in buckets:
            h = str(int(row.tx_hour))
            buckets[key]["by_hour"][h] = {"sales": int(row.sales or 0), "tx": int(row.tx or 0), "items": 0}

    # Step 4: Line items scan (skip raw_data)
    line_rows = db.query(
        SalesTransaction.location_id,
        func.date(SalesTransaction.transaction_date).label("tx_date"),
        func.extract("hour", SalesTransaction.transaction_date).label("tx_hour"),
        SalesTransaction.line_items,
    ).filter(
        SalesTransaction.location_id.in_(location_ids),
        SalesTransaction.payment_status == "COMPLETED",
        SalesTransaction.line_items.isnot(None),
    ).yield_per(5000).all()

    product_agg: Dict[tuple, Dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {"qty": 0, "revenue": 0}))
    for row in line_rows:
        key = (str(row.location_id), row.tx_date)
        items_count = 0
        if row.line_items:
            for item in row.line_items:
                qty = int(item.get("quantity", item.get("qty", 1)))
                items_count += qty
                name = item.get("name", "Unknown")
                rev = int(item.get("total_money", {}).get("amount", 0)) if isinstance(item.get("total_money"), dict) else 0
                product_agg[key][name]["qty"] += qty
                product_agg[key][name]["revenue"] += rev
        if key in buckets:
            buckets[key]["total_items"] += items_count
            h = str(int(row.tx_hour))
            if h in buckets[key]["by_hour"]:
                buckets[key]["by_hour"][h]["items"] += items_count

    for key, products in product_agg.items():
        if key in buckets:
            buckets[key]["top_products"] = sorted(
                [{"name": n, "qty": d["qty"], "revenue": d["revenue"]} for n, d in products.items()],
                key=lambda x: x["revenue"], reverse=True
            )[:50]

    # Step 5: Returns counts and amounts (merchandise returns, not just monetary refunds)
    # Uses raw_data->'returns' which captures all returns including exchanges.
    # Square's total_money in return_amounts INCLUDES tax, so we subtract tax_money
    # to get the ex-tax return value matching Square Dashboard's "Returns" line.
    return_rows = db.query(
        SalesTransaction.location_id,
        func.date(SalesTransaction.transaction_date).label("tx_date"),
        SalesTransaction.raw_data,
    ).filter(
        SalesTransaction.location_id.in_(location_ids),
        text("jsonb_array_length(coalesce(raw_data->'returns', '[]'::jsonb)) > 0"),
    ).yield_per(5000).all()

    for row in return_rows:
        key = (str(row.location_id), row.tx_date)
        if key in buckets:
            buckets[key]["refund_count"] += 1
            returns = (row.raw_data or {}).get("returns", [])
            for ret in returns:
                return_amounts = ret.get("return_amounts") or {}
                total_money = (return_amounts.get("total_money") or {}).get("amount", 0)
                tax_money = (return_amounts.get("tax_money") or {}).get("amount", 0)
                buckets[key]["total_refund_amount"] += (total_money - tax_money)

    # Step 6: Delete old and insert new
    db.query(DailySalesSummary).filter(
        DailySalesSummary.location_id.in_(location_ids)
    ).delete(synchronize_session=False)

    created = 0
    for (loc_id, tx_date), b in buckets.items():
        db.add(DailySalesSummary(
            id=uuid_lib.uuid4(),
            location_id=loc_id,
            date=tx_date,
            total_sales=b["total_sales"],
            total_gross=b["total_gross"],
            transaction_count=b["transaction_count"],
            total_items=b["total_items"],
            total_tax=b["total_tax"],
            total_tips=b["total_tips"],
            total_discounts=b["total_discounts"],
            total_refund_amount=b["total_refund_amount"],
            refund_count=b["refund_count"],
            by_tender_type=b["by_tender_type"],
            by_hour=b["by_hour"],
            top_products=b["top_products"],
            currency=b["currency"],
            updated_at=datetime.utcnow(),
        ))
        created += 1

    db.commit()
    return created
