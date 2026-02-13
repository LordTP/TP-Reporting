"""
Client Group Model — allows admins to group clients for aggregated analytics views.
"""
from sqlalchemy import Column, String, Boolean, ForeignKey, Table, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base


# Association table for many-to-many relationship
client_group_members = Table(
    'client_group_members',
    Base.metadata,
    Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    Column('client_group_id', UUID(as_uuid=True), ForeignKey('client_groups.id', ondelete='CASCADE'), nullable=False),
    Column('client_id', UUID(as_uuid=True), ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
    Column('created_at', DateTime, default=datetime.utcnow, nullable=False),
    UniqueConstraint('client_group_id', 'client_id', name='uq_client_group_member'),
)


class ClientGroup(Base):
    __tablename__ = "client_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="client_groups")
    clients = relationship("Client", secondary="client_group_members", back_populates="client_groups")

    def __repr__(self):
        return f"<ClientGroup {self.name}>"
