"""
Budget Model
"""
from sqlalchemy import Column, String, BigInteger, Date, DateTime, ForeignKey, Index, Text, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum

from app.database import Base


class BudgetType(str, enum.Enum):
    """Budget type enumeration"""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class Budget(Base):
    __tablename__ = "budgets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    budget_amount = Column(BigInteger, nullable=False)  # Stored in cents
    currency = Column(String, nullable=False)
    budget_type = Column(SQLEnum(BudgetType, values_callable=lambda obj: [e.value for e in obj]), nullable=False, default=BudgetType.DAILY)
    notes = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    location = relationship("Location", back_populates="budgets")
    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        Index('idx_budgets_location_date', 'location_id', 'date'),
        # Unique constraint: one budget per location, date, and type
        Index('uq_location_date_type', 'location_id', 'date', 'budget_type', unique=True),
    )

    def __repr__(self):
        return f"<Budget {self.location_id} {self.date} {self.budget_type}>"
