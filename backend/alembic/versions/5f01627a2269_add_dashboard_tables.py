"""add dashboard tables

Revision ID: 5f01627a2269
Revises: e9d4f700f134
Create Date: 2026-01-28 17:48:18.598124

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = '5f01627a2269'
down_revision: Union[str, None] = 'e9d4f700f134'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create dashboards table
    op.create_table(
        'dashboards',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('config', JSONB, nullable=False, server_default='{}'),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('is_template', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # Create dashboard_locations table
    op.create_table(
        'dashboard_locations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('dashboard_id', UUID(as_uuid=True), sa.ForeignKey('dashboards.id', ondelete='CASCADE'), nullable=False),
        sa.Column('location_id', UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('dashboard_id', 'location_id', name='uq_dashboard_location'),
    )

    # Create user_dashboard_permissions table
    op.create_table(
        'user_dashboard_permissions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('dashboard_id', UUID(as_uuid=True), sa.ForeignKey('dashboards.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'dashboard_id', name='uq_user_dashboard'),
    )


def downgrade() -> None:
    op.drop_table('user_dashboard_permissions')
    op.drop_table('dashboard_locations')
    op.drop_table('dashboards')
