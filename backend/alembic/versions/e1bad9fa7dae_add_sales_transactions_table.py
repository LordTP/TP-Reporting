"""add sales transactions table

Revision ID: e1bad9fa7dae
Revises: d0e9b5819fd9
Create Date: 2026-01-28 15:22:16.968948

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e1bad9fa7dae'
down_revision: Union[str, None] = 'd0e9b5819fd9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create sales_transactions table
    op.create_table(
        'sales_transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('location_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('square_transaction_id', sa.String(), nullable=False, unique=True),

        # Transaction timing
        sa.Column('transaction_date', sa.DateTime(timezone=True), nullable=False),

        # Money amounts (stored in smallest currency unit - cents)
        sa.Column('amount_money_amount', sa.BigInteger(), nullable=False),
        sa.Column('amount_money_currency', sa.String(), nullable=False),
        sa.Column('amount_money_usd_equivalent', sa.BigInteger(), nullable=True),

        sa.Column('total_money_amount', sa.BigInteger(), nullable=False),
        sa.Column('total_money_currency', sa.String(), nullable=False),

        sa.Column('total_discount_amount', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('total_tax_amount', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('total_tip_amount', sa.BigInteger(), nullable=False, server_default='0'),

        # Payment details
        sa.Column('tender_type', sa.String(), nullable=True),
        sa.Column('payment_status', sa.String(), nullable=False),
        sa.Column('card_brand', sa.String(), nullable=True),
        sa.Column('last_4', sa.String(), nullable=True),

        # Product/Category info
        sa.Column('product_categories', postgresql.JSONB(), nullable=True),
        sa.Column('line_items', postgresql.JSONB(), nullable=True),

        # Customer info
        sa.Column('customer_id', sa.String(), nullable=True),

        # Full Square API response
        sa.Column('raw_data', postgresql.JSONB(), nullable=False),

        # Metadata
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # Create indexes for performance
    op.create_index('idx_sales_location_date', 'sales_transactions', ['location_id', 'transaction_date'])
    op.create_index('idx_sales_square_id', 'sales_transactions', ['square_transaction_id'])
    op.create_index('idx_sales_date', 'sales_transactions', ['transaction_date'])
    op.create_index('idx_sales_status', 'sales_transactions', ['payment_status'])
    op.create_index('idx_sales_currency', 'sales_transactions', ['amount_money_currency'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('idx_sales_currency', table_name='sales_transactions')
    op.drop_index('idx_sales_status', table_name='sales_transactions')
    op.drop_index('idx_sales_date', table_name='sales_transactions')
    op.drop_index('idx_sales_square_id', table_name='sales_transactions')
    op.drop_index('idx_sales_location_date', table_name='sales_transactions')

    # Drop table
    op.drop_table('sales_transactions')
