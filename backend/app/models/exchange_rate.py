"""
Exchange Rate Model
"""
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    from_currency = Column(String, nullable=False)  # e.g. "EUR"
    to_currency = Column(String, nullable=False, default="GBP")  # base currency
    rate = Column(Float, nullable=False)  # e.g. 0.85 means 1 EUR = 0.85 GBP
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Relationships
    organization = relationship("Organization")
    updater = relationship("User", foreign_keys=[updated_by])

    __table_args__ = (
        UniqueConstraint("organization_id", "from_currency", "to_currency", name="uq_org_from_to_currency"),
    )

    def __repr__(self):
        return f"<ExchangeRate {self.from_currency}->{self.to_currency} @ {self.rate}>"
