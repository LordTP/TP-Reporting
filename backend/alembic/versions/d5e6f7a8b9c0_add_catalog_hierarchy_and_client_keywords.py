"""add catalog hierarchy and client category keywords

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-01-30 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'd5e6f7a8b9c0'
down_revision = 'c4d5e6f7a8b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New table: catalog_categories (stores Square category hierarchy)
    op.create_table(
        'catalog_categories',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('square_account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('square_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('square_category_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('parent_category_id', sa.String(), nullable=True),
        sa.Column('is_top_level', sa.Boolean(), default=False, nullable=False),
        sa.Column('path_to_root', postgresql.JSONB(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('square_account_id', 'square_category_id', name='uq_catalog_cat_account_sq_id'),
    )
    op.create_index('idx_catalog_categories_parent', 'catalog_categories', ['parent_category_id'])
    op.create_index('idx_catalog_categories_account', 'catalog_categories', ['square_account_id'])

    # New table: catalog_item_category_memberships (many-to-many items <-> categories)
    op.create_table(
        'catalog_item_category_memberships',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('square_account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('square_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('catalog_object_id', sa.String(), nullable=False),
        sa.Column('item_id', sa.String(), nullable=False),
        sa.Column('category_id', sa.String(), nullable=False),
        sa.UniqueConstraint('square_account_id', 'catalog_object_id', 'category_id', name='uq_item_cat_membership'),
    )
    op.create_index('idx_cat_membership_obj', 'catalog_item_category_memberships', ['catalog_object_id'])
    op.create_index('idx_cat_membership_cat', 'catalog_item_category_memberships', ['category_id'])

    # Alter catalog_item_categories: add artist_name
    op.add_column('catalog_item_categories', sa.Column('artist_name', sa.String(), nullable=True))

    # Alter clients: add category_keywords JSONB
    op.add_column('clients', sa.Column('category_keywords', postgresql.JSONB(), nullable=True))

    # New table: client_catalog_mappings (pre-computed client → product associations)
    op.create_table(
        'client_catalog_mappings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('catalog_object_id', sa.String(), nullable=False),
        sa.Column('matched_keyword', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('client_id', 'catalog_object_id', name='uq_client_catalog_mapping'),
    )
    op.create_index('idx_client_catalog_client', 'client_catalog_mappings', ['client_id'])
    op.create_index('idx_client_catalog_obj', 'client_catalog_mappings', ['catalog_object_id'])


def downgrade() -> None:
    op.drop_index('idx_client_catalog_obj')
    op.drop_index('idx_client_catalog_client')
    op.drop_table('client_catalog_mappings')
    op.drop_column('clients', 'category_keywords')
    op.drop_column('catalog_item_categories', 'artist_name')
    op.drop_index('idx_cat_membership_cat')
    op.drop_index('idx_cat_membership_obj')
    op.drop_table('catalog_item_category_memberships')
    op.drop_index('idx_catalog_categories_account')
    op.drop_index('idx_catalog_categories_parent')
    op.drop_table('catalog_categories')
