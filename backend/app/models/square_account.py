"""
Square Account Model
"""
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base


class SquareAccount(Base):
    __tablename__ = "square_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    square_merchant_id = Column(String, unique=True, nullable=False, index=True)
    access_token_encrypted = Column(String, nullable=False)
    refresh_token_encrypted = Column(String, nullable=False)
    token_expires_at = Column(DateTime, nullable=False)
    account_name = Column(String, nullable=False)
    base_currency = Column(String, nullable=False, default="USD")
    is_active = Column(Boolean, default=True, nullable=False)
    last_sync_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="square_accounts")
    locations = relationship("Location", back_populates="square_account", cascade="all, delete-orphan")
    data_imports = relationship("DataImport", back_populates="square_account", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<SquareAccount {self.account_name} ({self.square_merchant_id})>"
