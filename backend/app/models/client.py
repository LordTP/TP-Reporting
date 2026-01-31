"""
Client Model - for assigning to locations
"""
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, Table
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base


class Client(Base):
    __tablename__ = "clients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    category_keywords = Column(JSONB, nullable=True, default=None)  # e.g. ["Warner Music"]
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="clients")
    locations = relationship("Location", secondary="client_locations", back_populates="clients")
    users = relationship("User", back_populates="client")

    def __repr__(self):
        return f"<Client {self.name}>"


# Association table for many-to-many relationship between clients and locations
client_locations = Table(
    'client_locations',
    Base.metadata,
    Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    Column('client_id', UUID(as_uuid=True), ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
    Column('location_id', UUID(as_uuid=True), ForeignKey('locations.id', ondelete='CASCADE'), nullable=False),
    Column('created_at', DateTime, default=datetime.utcnow, nullable=False)
)

# Association table for many-to-many relationship between users and clients
user_clients = Table(
    'user_clients',
    Base.metadata,
    Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    Column('user_id', UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
    Column('client_id', UUID(as_uuid=True), ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
    Column('created_at', DateTime, default=datetime.utcnow, nullable=False)
)
