"""add budgets table

Revision ID: a1b2c3d4e5f6
Revises: c159ce7c0683
Create Date: 2026-01-29 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'c159ce7c0683'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create budgets table
    # The Enum will be created automatically
    op.create_table(
        'budgets',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('location_id', UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('budget_amount', sa.BigInteger(), nullable=False),
        sa.Column('currency', sa.String(), nullable=False),
        sa.Column('budget_type', sa.Enum('daily', 'weekly', 'monthly', name='budgettype'), nullable=False, server_default='daily'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # Create indexes
    op.create_index('idx_budgets_location_date', 'budgets', ['location_id', 'date'])
    op.create_index('uq_location_date_type', 'budgets', ['location_id', 'date', 'budget_type'], unique=True)


def downgrade() -> None:
    op.drop_index('uq_location_date_type', table_name='budgets')
    op.drop_index('idx_budgets_location_date', table_name='budgets')
    op.drop_table('budgets')

    # Drop enum type
    budget_type_enum = sa.Enum('daily', 'weekly', 'monthly', name='budgettype')
    budget_type_enum.drop(op.get_bind(), checkfirst=True)
