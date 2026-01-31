"""
Catalog Category Model - Caches Square catalog item → reporting category mappings
"""
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid

from app.database import Base


class CatalogItemCategory(Base):
    __tablename__ = "catalog_item_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    square_account_id = Column(UUID(as_uuid=True), ForeignKey("square_accounts.id"), nullable=False)
    catalog_object_id = Column(String, nullable=False, index=True)
    item_id = Column(String, nullable=True)
    item_name = Column(String, nullable=True)
    variation_name = Column(String, nullable=True)
    category_id = Column(String, nullable=True)
    category_name = Column(String, nullable=False, default="Uncategorized")
    artist_name = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    square_account = relationship("SquareAccount")

    def __repr__(self):
        return f"<CatalogItemCategory {self.item_name} -> {self.category_name}>"
