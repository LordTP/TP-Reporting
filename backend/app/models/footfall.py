"""
Footfall Entry Model
"""
from sqlalchemy import Column, Integer, Date, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


class FootfallEntry(Base):
    __tablename__ = "footfall_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    count = Column(Integer, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    location = relationship("Location", back_populates="footfall_entries")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])
    organization = relationship("Organization")

    __table_args__ = (
        Index('idx_footfall_location_date', 'location_id', 'date'),
        Index('uq_org_location_date', 'organization_id', 'location_id', 'date', unique=True),
    )

    def __repr__(self):
        return f"<FootfallEntry {self.location_id} {self.date} count={self.count}>"
