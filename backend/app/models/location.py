"""
Location Model
"""
from sqlalchemy import Column, String, Boolean, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.database import Base


class Location(Base):
    __tablename__ = "locations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    square_account_id = Column(UUID(as_uuid=True), ForeignKey("square_accounts.id"), nullable=False)
    square_location_id = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    address = Column(JSON, nullable=True)
    currency = Column(String, nullable=False)
    timezone = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    location_metadata = Column(JSON, nullable=True)

    # Relationships
    square_account = relationship("SquareAccount", back_populates="locations")
    sales_transactions = relationship("SalesTransaction", back_populates="location", cascade="all, delete-orphan")
    clients = relationship("Client", secondary="client_locations", back_populates="locations")
    location_groups = relationship("LocationGroup", secondary="location_group_members", back_populates="locations")
    data_imports = relationship("DataImport", back_populates="location", cascade="all, delete-orphan")
    budgets = relationship("Budget", back_populates="location", cascade="all, delete-orphan")
    footfall_entries = relationship("FootfallEntry", back_populates="location", cascade="all, delete-orphan")
    # TODO: Uncomment when Phase 6-7 models are created
    # location_permissions = relationship("UserLocationPermission", back_populates="location", cascade="all, delete-orphan")
    # dashboard_locations = relationship("DashboardLocation", back_populates="location", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Location {self.name} ({self.square_location_id})>"
