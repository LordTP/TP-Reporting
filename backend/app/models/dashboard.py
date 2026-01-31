"""
Dashboard Model
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base


class Dashboard(Base):
    __tablename__ = "dashboards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # Dashboard configuration stored as JSON
    # Example: {"widgets": [{"type": "line_chart", "title": "Sales Trend", ...}]}
    config = Column(JSONB, nullable=False, default=dict)

    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    is_template = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="dashboards")
    creator = relationship("User", foreign_keys=[created_by])
    dashboard_locations = relationship("DashboardLocation", back_populates="dashboard", cascade="all, delete-orphan")
    user_permissions = relationship("UserDashboardPermission", back_populates="dashboard", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Dashboard {self.name}>"


class DashboardLocation(Base):
    """Many-to-many relationship between dashboards and locations"""
    __tablename__ = "dashboard_locations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dashboard_id = Column(UUID(as_uuid=True), ForeignKey("dashboards.id", ondelete="CASCADE"), nullable=False)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    dashboard = relationship("Dashboard", back_populates="dashboard_locations")
    location = relationship("Location")

    __table_args__ = (
        UniqueConstraint('dashboard_id', 'location_id', name='uq_dashboard_location'),
    )

    def __repr__(self):
        return f"<DashboardLocation {self.dashboard_id} - {self.location_id}>"


class UserDashboardPermission(Base):
    """User permissions for dashboards"""
    __tablename__ = "user_dashboard_permissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    dashboard_id = Column(UUID(as_uuid=True), ForeignKey("dashboards.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User")
    dashboard = relationship("Dashboard", back_populates="user_permissions")

    __table_args__ = (
        UniqueConstraint('user_id', 'dashboard_id', name='uq_user_dashboard'),
    )

    def __repr__(self):
        return f"<UserDashboardPermission {self.user_id} - {self.dashboard_id}>"
