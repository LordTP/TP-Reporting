"""
User Model with Role-Based Access Control
"""
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.database import Base


class UserRole(str, enum.Enum):
    """User roles for RBAC"""
    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    MANAGER = "manager"  # kept for backward compatibility
    STORE_MANAGER = "store_manager"
    REPORTING = "reporting"
    CLIENT = "client"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(Enum(UserRole, values_callable=lambda x: [e.value for e in x]), nullable=False, default=UserRole.CLIENT)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, nullable=True)

    # Relationships
    organization = relationship("Organization", back_populates="users")
    client = relationship("Client", back_populates="users", foreign_keys=[client_id])
    assigned_clients = relationship("Client", secondary="user_clients")
    # TODO: Uncomment when Phase 6-8 models are created
    # location_permissions = relationship("UserLocationPermission", back_populates="user", cascade="all, delete-orphan")
    # dashboard_permissions = relationship("UserDashboardPermission", back_populates="user", cascade="all, delete-orphan")
    # created_dashboards = relationship("Dashboard", back_populates="creator", foreign_keys="Dashboard.created_by")
    # created_budgets = relationship("Budget", back_populates="creator", foreign_keys="Budget.created_by")
    # audit_logs = relationship("AuditLog", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User {self.email} ({self.role})>"

    def has_role(self, *roles: UserRole) -> bool:
        """Check if user has any of the specified roles"""
        return self.role in roles

    def is_admin(self) -> bool:
        """Check if user is admin or superadmin"""
        return self.role in (UserRole.ADMIN, UserRole.SUPERADMIN)

    def is_client_locked(self) -> bool:
        """Check if user is locked to a specific client"""
        return self.client_id is not None

    def is_superadmin(self) -> bool:
        """Check if user is superadmin"""
        return self.role == UserRole.SUPERADMIN
