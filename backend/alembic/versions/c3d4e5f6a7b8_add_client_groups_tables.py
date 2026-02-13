"""Add client_groups and client_group_members tables

Revision ID: c3d4e5f6a7b8
Revises: b1c2d3e4f5a6
Create Date: 2026-02-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers
revision = 'c3d4e5f6a7b8'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade():
    # Create client_groups table
    op.create_table(
        'client_groups',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('is_active', sa.Boolean, server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_client_groups_organization_id', 'client_groups', ['organization_id'])

    # Create client_group_members association table
    op.create_table(
        'client_group_members',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('client_group_id', UUID(as_uuid=True), sa.ForeignKey('client_groups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('client_id', UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('client_group_id', 'client_id', name='uq_client_group_member'),
    )
    op.create_index('ix_client_group_members_client_group_id', 'client_group_members', ['client_group_id'])
    op.create_index('ix_client_group_members_client_id', 'client_group_members', ['client_id'])


def downgrade():
    op.drop_index('ix_client_group_members_client_id', table_name='client_group_members')
    op.drop_index('ix_client_group_members_client_group_id', table_name='client_group_members')
    op.drop_table('client_group_members')
    op.drop_index('ix_client_groups_organization_id', table_name='client_groups')
    op.drop_table('client_groups')
