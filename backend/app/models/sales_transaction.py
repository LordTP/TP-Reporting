"""
Sales Transaction Model - Denormalized for performance
"""
from sqlalchemy import Column, String, DateTime, BigInteger, ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base


class SalesTransaction(Base):
    __tablename__ = "sales_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE"), nullable=False)
    square_transaction_id = Column(String, unique=True, nullable=False)

    # Transaction timing
    transaction_date = Column(DateTime(timezone=True), nullable=False)

    # Money amounts (stored in smallest currency unit - cents, pence, etc.)
    amount_money_amount = Column(BigInteger, nullable=False)  # Net amount
    amount_money_currency = Column(String, nullable=False)
    amount_money_usd_equivalent = Column(BigInteger, nullable=True)  # For cross-currency reporting

    total_money_amount = Column(BigInteger, nullable=False)  # Gross total
    total_money_currency = Column(String, nullable=False)

    total_discount_amount = Column(BigInteger, default=0, nullable=False)
    total_tax_amount = Column(BigInteger, default=0, nullable=False)
    total_tip_amount = Column(BigInteger, default=0, nullable=False)

    # Payment details
    tender_type = Column(String, nullable=True)  # CARD, CASH, etc.
    payment_status = Column(String, nullable=False)  # COMPLETED, FAILED, etc.
    card_brand = Column(String, nullable=True)  # VISA, MASTERCARD, etc.
    last_4 = Column(String, nullable=True)  # Last 4 digits of card

    # Product/Category info (for future analytics)
    product_categories = Column(JSONB, nullable=True)  # Array of categories
    line_items = Column(JSONB, nullable=True)  # Array of line items

    # Customer info
    customer_id = Column(String, nullable=True)

    # Full Square API response for reference
    raw_data = Column(JSONB, nullable=False)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    location = relationship("Location", back_populates="sales_transactions")

    # Indexes for performance
    __table_args__ = (
        Index('idx_sales_location_date', 'location_id', 'transaction_date'),
        Index('idx_sales_square_id', 'square_transaction_id'),
        Index('idx_sales_date', 'transaction_date'),
        Index('idx_sales_status', 'payment_status'),
        Index('idx_sales_currency', 'amount_money_currency'),
        # Composite index for filtered aggregation queries (location + status + date range)
        Index('idx_sales_loc_status_date', 'location_id', 'payment_status', 'transaction_date'),
    )

    def __repr__(self):
        return f"<SalesTransaction {self.square_transaction_id}>"
