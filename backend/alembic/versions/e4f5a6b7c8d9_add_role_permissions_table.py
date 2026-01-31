"""add role_permissions table

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-01-31
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'e4f5a6b7c8d9'
down_revision = 'd3e4f5a6b7c8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'role_permissions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('permission_key', sa.String(), nullable=False),
        sa.Column('granted', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.UniqueConstraint('organization_id', 'role', 'permission_key', name='uq_org_role_permission'),
    )
    op.create_index('ix_role_permissions_org_role', 'role_permissions', ['organization_id', 'role'])


def downgrade():
    op.drop_index('ix_role_permissions_org_role')
    op.drop_table('role_permissions')
