"""add footfall_entries table

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-01-31
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'f5a6b7c8d9e0'
down_revision = 'e4f5a6b7c8d9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'footfall_entries',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('location_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('count', sa.Integer(), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('idx_footfall_location_date', 'footfall_entries', ['location_id', 'date'])
    op.create_index('uq_org_location_date', 'footfall_entries', ['organization_id', 'location_id', 'date'], unique=True)
    op.create_index('ix_footfall_entries_date', 'footfall_entries', ['date'])


def downgrade():
    op.drop_index('ix_footfall_entries_date')
    op.drop_index('uq_org_location_date')
    op.drop_index('idx_footfall_location_date')
    op.drop_table('footfall_entries')
