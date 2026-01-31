"""add square integration tables

Revision ID: d0e9b5819fd9
Revises: 001
Create Date: 2026-01-28 14:06:17.532279

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd0e9b5819fd9'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enums
    op.execute("DO $$ BEGIN CREATE TYPE importtype AS ENUM ('historical', 'manual_sync'); EXCEPTION WHEN duplicate_object THEN null; END $$;")
    op.execute("DO $$ BEGIN CREATE TYPE importstatus AS ENUM ('pending', 'in_progress', 'completed', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;")

    # Create square_accounts table
    op.create_table(
        'square_accounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('square_merchant_id', sa.String(), nullable=False, unique=True),
        sa.Column('access_token_encrypted', sa.Text(), nullable=False),
        sa.Column('refresh_token_encrypted', sa.Text(), nullable=False),
        sa.Column('token_expires_at', sa.DateTime(), nullable=False),
        sa.Column('account_name', sa.String(), nullable=False),
        sa.Column('base_currency', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_sync_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('ix_square_accounts_organization_id', 'square_accounts', ['organization_id'])
    op.create_index('ix_square_accounts_square_merchant_id', 'square_accounts', ['square_merchant_id'])

    # Create locations table
    op.create_table(
        'locations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('square_account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('square_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('square_location_id', sa.String(), nullable=False, unique=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('address', postgresql.JSONB(), nullable=True),
        sa.Column('currency', sa.String(), nullable=False),
        sa.Column('timezone', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('metadata', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('ix_locations_square_account_id', 'locations', ['square_account_id'])
    op.create_index('ix_locations_square_location_id', 'locations', ['square_location_id'])
    op.create_index('ix_locations_is_active', 'locations', ['is_active'])

    # Create data_imports table
    op.create_table(
        'data_imports',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('square_account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('square_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('location_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('import_type', postgresql.ENUM('historical', 'manual_sync', name='importtype', create_type=False), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('status', postgresql.ENUM('pending', 'in_progress', 'completed', 'failed', name='importstatus', create_type=False), nullable=False),
        sa.Column('total_transactions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('imported_transactions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('duplicate_transactions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('initiated_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('ix_data_imports_square_account_id', 'data_imports', ['square_account_id'])
    op.create_index('ix_data_imports_location_id', 'data_imports', ['location_id'])
    op.create_index('ix_data_imports_status', 'data_imports', ['status'])
    op.create_index('ix_data_imports_created_at', 'data_imports', ['created_at'])


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_table('data_imports')
    op.drop_table('locations')
    op.drop_table('square_accounts')

    # Drop enums
    op.execute("DROP TYPE IF EXISTS importstatus CASCADE;")
    op.execute("DROP TYPE IF EXISTS importtype CASCADE;")
