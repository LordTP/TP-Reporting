"""add composite sales index for performance

Revision ID: f7ffca77f5ca
Revises: a1b2c3d4e5f6
Create Date: 2026-01-30 05:20:25.923045

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f7ffca77f5ca'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'idx_sales_loc_status_date',
        'sales_transactions',
        ['location_id', 'payment_status', 'transaction_date'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('idx_sales_loc_status_date', table_name='sales_transactions')
