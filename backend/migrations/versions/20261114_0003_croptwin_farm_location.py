"""croptwin: farm location point

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-14

Nullable, so existing farms are unchanged: their maps still open on their fields.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('farms', schema=None) as batch_op:
        batch_op.add_column(sa.Column('location_lat', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('location_lon', sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('farms', schema=None) as batch_op:
        batch_op.drop_column('location_lon')
        batch_op.drop_column('location_lat')
