"""
Catalog Hierarchy Models - Stores full Square category tree and item-category memberships
"""
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid

from app.database import Base


class CatalogCategory(Base):
    """Stores each Square category with hierarchy info."""
    __tablename__ = "catalog_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    square_account_id = Column(UUID(as_uuid=True), ForeignKey("square_accounts.id", ondelete="CASCADE"), nullable=False)
    square_category_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    parent_category_id = Column(String, nullable=True)
    is_top_level = Column(Boolean, default=False, nullable=False)
    path_to_root = Column(JSONB, nullable=True)  # [{id, name}, ...] from self to root
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    square_account = relationship("SquareAccount")

    def __repr__(self):
        return f"<CatalogCategory {self.name} ({self.square_category_id})>"


class CatalogItemCategoryMembership(Base):
    """Many-to-many: a catalog item/variation can belong to many categories."""
    __tablename__ = "catalog_item_category_memberships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    square_account_id = Column(UUID(as_uuid=True), ForeignKey("square_accounts.id", ondelete="CASCADE"), nullable=False)
    catalog_object_id = Column(String, nullable=False, index=True)
    item_id = Column(String, nullable=False)
    category_id = Column(String, nullable=False, index=True)

    square_account = relationship("SquareAccount")

    def __repr__(self):
        return f"<CatalogItemCategoryMembership {self.catalog_object_id} -> {self.category_id}>"


class ClientCatalogMapping(Base):
    """Pre-computed mapping: client → catalog_object_ids that match their keywords."""
    __tablename__ = "client_catalog_mappings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    catalog_object_id = Column(String, nullable=False, index=True)
    matched_keyword = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    client = relationship("Client")

    def __repr__(self):
        return f"<ClientCatalogMapping {self.client_id} -> {self.catalog_object_id}>"
