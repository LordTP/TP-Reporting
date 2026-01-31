"""add daily_sales_summary table

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-01-30 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'c4d5e6f7a8b9'
down_revision = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'daily_sales_summary',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('location_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('total_sales', sa.BigInteger(), default=0, nullable=False),
        sa.Column('total_gross', sa.BigInteger(), default=0, nullable=False),
        sa.Column('transaction_count', sa.Integer(), default=0, nullable=False),
        sa.Column('total_items', sa.Integer(), default=0, nullable=False),
        sa.Column('total_tax', sa.BigInteger(), default=0, nullable=False),
        sa.Column('total_tips', sa.BigInteger(), default=0, nullable=False),
        sa.Column('total_discounts', sa.BigInteger(), default=0, nullable=False),
        sa.Column('total_refund_amount', sa.BigInteger(), default=0, nullable=False),
        sa.Column('refund_count', sa.Integer(), default=0, nullable=False),
        sa.Column('by_tender_type', postgresql.JSONB(), server_default='{}', nullable=False),
        sa.Column('by_hour', postgresql.JSONB(), server_default='{}', nullable=False),
        sa.Column('top_products', postgresql.JSONB(), server_default='[]', nullable=False),
        sa.Column('currency', sa.String(), server_default='GBP', nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('location_id', 'date', name='uq_daily_summary_location_date'),
    )
    op.create_index('idx_daily_summary_date', 'daily_sales_summary', ['date'])
    op.create_index('idx_daily_summary_loc_date', 'daily_sales_summary', ['location_id', 'date'])


def downgrade() -> None:
    op.drop_index('idx_daily_summary_loc_date')
    op.drop_index('idx_daily_summary_date')
    op.drop_table('daily_sales_summary')
