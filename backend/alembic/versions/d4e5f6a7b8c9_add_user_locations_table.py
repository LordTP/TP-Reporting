"""Add user_locations table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers
revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'user_locations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('location_id', UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_user_locations_user_id', 'user_locations', ['user_id'])
    op.create_index('ix_user_locations_location_id', 'user_locations', ['location_id'])
    op.create_unique_constraint('uq_user_locations_user_location', 'user_locations', ['user_id', 'location_id'])


def downgrade() -> None:
    op.drop_table('user_locations')
