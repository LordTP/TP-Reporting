"""Add client_id to users and update UserRole enum

Revision ID: a2b3c4d5e6f7
Revises: d5e6f7a8b9c0
Create Date: 2026-01-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers
revision = 'a2b3c4d5e6f7'
down_revision = 'd5e6f7a8b9c0'
branch_labels = None
depends_on = None


def upgrade():
    # Add new enum values to userrole type
    # PostgreSQL requires adding values one at a time outside a transaction
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'store_manager'")
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'reporting'")

    # Add client_id column to users table
    op.add_column('users', sa.Column('client_id', UUID(as_uuid=True), sa.ForeignKey('clients.id'), nullable=True))
    op.create_index('ix_users_client_id', 'users', ['client_id'])


def downgrade():
    op.drop_index('ix_users_client_id', table_name='users')
    op.drop_column('users', 'client_id')
    # Note: PostgreSQL doesn't support removing enum values easily
