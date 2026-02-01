"""Add user_clients many-to-many table for multi-client access

Revision ID: b1c2d3e4f5a6
Revises: a2b3c4d5e6f7
Create Date: 2026-01-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers
revision = 'b1c2d3e4f5a6'
down_revision = 'a2b3c4d5e6f7'
branch_labels = None
depends_on = None


def upgrade():
    # Create user_clients association table
    op.create_table(
        'user_clients',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('client_id', UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_user_clients_user_id', 'user_clients', ['user_id'])
    op.create_index('ix_user_clients_client_id', 'user_clients', ['client_id'])

    # Data migration: copy existing client_id from store_manager/reporting/manager users
    # into user_clients so they keep their existing assignment.
    # Cast role to text to avoid PostgreSQL "unsafe new enum value" error when
    # enum values were added in a prior migration within the same transaction.
    op.execute("""
        INSERT INTO user_clients (id, user_id, client_id, created_at)
        SELECT gen_random_uuid(), id, client_id, now()
        FROM users
        WHERE client_id IS NOT NULL
          AND role::text IN ('store_manager', 'reporting', 'manager')
    """)


def downgrade():
    op.drop_index('ix_user_clients_client_id', table_name='user_clients')
    op.drop_index('ix_user_clients_user_id', table_name='user_clients')
    op.drop_table('user_clients')
