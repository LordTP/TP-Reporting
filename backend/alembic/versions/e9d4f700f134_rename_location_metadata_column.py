"""rename location metadata column

Revision ID: e9d4f700f134
Revises: e1bad9fa7dae
Create Date: 2026-01-28 15:52:57.581862

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e9d4f700f134'
down_revision: Union[str, None] = 'e1bad9fa7dae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename metadata column to location_metadata
    op.alter_column('locations', 'metadata', new_column_name='location_metadata')


def downgrade() -> None:
    # Revert: rename location_metadata back to metadata
    op.alter_column('locations', 'location_metadata', new_column_name='metadata')
