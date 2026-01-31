"""add catalog_item_categories table

Revision ID: b3c4d5e6f7a8
Revises: f7ffca77f5ca
Create Date: 2026-01-30 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'f7ffca77f5ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'catalog_item_categories',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('square_account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('square_accounts.id'), nullable=False),
        sa.Column('catalog_object_id', sa.String(), nullable=False),
        sa.Column('item_id', sa.String(), nullable=True),
        sa.Column('item_name', sa.String(), nullable=True),
        sa.Column('variation_name', sa.String(), nullable=True),
        sa.Column('category_id', sa.String(), nullable=True),
        sa.Column('category_name', sa.String(), nullable=False, server_default='Uncategorized'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_catalog_item_categories_catalog_object_id', 'catalog_item_categories', ['catalog_object_id'])
    op.create_index('ix_catalog_item_categories_square_account_id', 'catalog_item_categories', ['square_account_id'])


def downgrade() -> None:
    op.drop_index('ix_catalog_item_categories_square_account_id', table_name='catalog_item_categories')
    op.drop_index('ix_catalog_item_categories_catalog_object_id', table_name='catalog_item_categories')
    op.drop_table('catalog_item_categories')
