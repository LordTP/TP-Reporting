"""
Location Group Model — allows admins to group locations for aggregated analytics views.
"""
from sqlalchemy import Column, String, Boolean, ForeignKey, Table, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base


# Association table for many-to-many relationship
location_group_members = Table(
    'location_group_members',
    Base.metadata,
    Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    Column('location_group_id', UUID(as_uuid=True), ForeignKey('location_groups.id', ondelete='CASCADE'), nullable=False),
    Column('location_id', UUID(as_uuid=True), ForeignKey('locations.id', ondelete='CASCADE'), nullable=False),
    Column('created_at', DateTime, default=datetime.utcnow, nullable=False),
    UniqueConstraint('location_group_id', 'location_id', name='uq_location_group_member'),
)


class LocationGroup(Base):
    __tablename__ = "location_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="location_groups")
    locations = relationship("Location", secondary="location_group_members", back_populates="location_groups")

    def __repr__(self):
        return f"<LocationGroup {self.name}>"
