"""
Timezone conversion helpers for location-aware date/hour extraction.
Uses PostgreSQL AT TIME ZONE for SQL queries and zoneinfo for Python-side conversion.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func
from app.models.location import Location
from app.models.sales_transaction import SalesTransaction


def local_transaction_dt(tz_expr=None):
    """
    SQLAlchemy expression that converts SalesTransaction.transaction_date
    from UTC to the location's local time.

    tz_expr: a SQLAlchemy column/expression for the timezone string.
             Defaults to Location.timezone (requires a JOIN to locations).
    """
    if tz_expr is None:
        tz_expr = Location.timezone
    safe_tz = func.coalesce(tz_expr, 'UTC')
    return func.timezone(safe_tz, SalesTransaction.transaction_date)


def local_date_col(tz_expr=None):
    """Extract the local date from the transaction timestamp."""
    return func.date(local_transaction_dt(tz_expr)).label("tx_date")


def local_hour_col(tz_expr=None):
    """Extract the local hour (0-23) from the transaction timestamp."""
    return func.extract("hour", local_transaction_dt(tz_expr)).label("tx_hour")


def utc_to_local(utc_dt: datetime, timezone_str: str | None) -> datetime:
    """Python-side conversion of a UTC datetime to a local datetime."""
    tz = ZoneInfo(timezone_str) if timezone_str else ZoneInfo("UTC")
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=ZoneInfo("UTC"))
    return utc_dt.astimezone(tz)
