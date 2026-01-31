"""
Data Import Model - Track historical Square data imports
"""
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Enum, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.database import Base


class ImportType(str, enum.Enum):
    """Import types"""
    HISTORICAL = "historical"
    MANUAL_SYNC = "manual_sync"


class ImportStatus(str, enum.Enum):
    """Import status"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class DataImport(Base):
    __tablename__ = "data_imports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    square_account_id = Column(UUID(as_uuid=True), ForeignKey("square_accounts.id"), nullable=False)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    import_type = Column(Enum(ImportType, values_callable=lambda x: [e.value for e in x]), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(Enum(ImportStatus, values_callable=lambda x: [e.value for e in x]), nullable=False, default=ImportStatus.PENDING)
    total_transactions = Column(Integer, default=0)
    imported_transactions = Column(Integer, default=0)
    duplicate_transactions = Column(Integer, default=0)
    error_message = Column(String, nullable=True)
    initiated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    square_account = relationship("SquareAccount", back_populates="data_imports")
    location = relationship("Location", back_populates="data_imports")
    user = relationship("User")

    def __repr__(self):
        return f"<DataImport {self.id} ({self.status})>"
