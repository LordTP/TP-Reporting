"""
Daily Sales Summary - Pre-aggregated daily totals per location for fast analytics.
Populated from sales_transactions via a rebuild endpoint.
"""
from sqlalchemy import Column, String, DateTime, BigInteger, Integer, Date, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from datetime import datetime
import uuid

from app.database import Base


class DailySalesSummary(Base):
    __tablename__ = "daily_sales_summary"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)

    # Aggregated metrics (all money in smallest unit - pence/cents)
    total_sales = Column(BigInteger, default=0, nullable=False)  # sum of amount_money_amount (COMPLETED)
    total_gross = Column(BigInteger, default=0, nullable=False)  # sum of total_money_amount
    transaction_count = Column(Integer, default=0, nullable=False)
    total_items = Column(Integer, default=0, nullable=False)  # sum of line item quantities
    total_tax = Column(BigInteger, default=0, nullable=False)
    total_tips = Column(BigInteger, default=0, nullable=False)
    total_discounts = Column(BigInteger, default=0, nullable=False)
    total_refund_amount = Column(BigInteger, default=0, nullable=False)
    refund_count = Column(Integer, default=0, nullable=False)

    # Breakdowns stored as JSONB for flexible querying
    by_tender_type = Column(JSONB, default=dict, nullable=False)  # {"CARD": 50000, "CASH": 10000}
    by_hour = Column(JSONB, default=dict, nullable=False)  # {"9": {"sales": 5000, "tx": 3, "items": 10}, ...}
    top_products = Column(JSONB, default=list, nullable=False)  # [{"name": "Coffee", "qty": 50, "revenue": 15000}, ...]

    currency = Column(String, default="GBP", nullable=False)

    # Metadata
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint('location_id', 'date', name='uq_daily_summary_location_date'),
        Index('idx_daily_summary_date', 'date'),
        Index('idx_daily_summary_loc_date', 'location_id', 'date'),
    )

    def __repr__(self):
        return f"<DailySalesSummary {self.location_id} {self.date}>"
