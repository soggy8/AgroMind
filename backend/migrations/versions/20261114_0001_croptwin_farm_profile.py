"""croptwin farm profile

Revision ID: 0001
Revises: 
Create Date: 2026-11-14 13:30:01.443659
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('farms',
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('region', sa.String(length=200), nullable=True),
    sa.Column('priorities', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('constraints', sa.Text(), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_farms'))
    )
    op.create_table('fields',
    sa.Column('farm_id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('boundary', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('centroid_lat', sa.Float(), nullable=False),
    sa.Column('centroid_lon', sa.Float(), nullable=False),
    sa.Column('area_ha', sa.Float(), nullable=False),
    sa.Column('area_source', sa.String(length=40), nullable=False),
    sa.Column('irrigation_available', sa.Boolean(), nullable=False),
    sa.Column('current_crop_id', sa.String(length=40), nullable=True),
    sa.Column('soil_texture', sa.String(length=40), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['farm_id'], ['farms.id'], name=op.f('fk_fields_farm_id_farms'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_fields'))
    )
    with op.batch_alter_table('fields', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_fields_farm_id'), ['farm_id'], unique=False)

    op.create_table('crop_history',
    sa.Column('field_id', sa.String(length=36), nullable=False),
    sa.Column('season_year', sa.Integer(), nullable=False),
    sa.Column('crop_id', sa.String(length=40), nullable=False),
    sa.Column('yield_value', sa.Float(), nullable=True),
    sa.Column('yield_unit', sa.String(length=20), nullable=True),
    sa.Column('source', sa.String(length=300), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.ForeignKeyConstraint(['field_id'], ['fields.id'], name=op.f('fk_crop_history_field_id_fields'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_crop_history')),
    sa.UniqueConstraint('field_id', 'season_year', 'crop_id', name=op.f('uq_crop_history_field_id_season_year_crop_id'))
    )
    with op.batch_alter_table('crop_history', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_crop_history_field_id'), ['field_id'], unique=False)

    op.create_table('soil_layers',
    sa.Column('field_id', sa.String(length=36), nullable=False),
    sa.Column('depth_top_cm', sa.Integer(), nullable=False),
    sa.Column('depth_bottom_cm', sa.Integer(), nullable=False),
    sa.Column('sand_pct', sa.Float(), nullable=True),
    sa.Column('silt_pct', sa.Float(), nullable=True),
    sa.Column('clay_pct', sa.Float(), nullable=True),
    sa.Column('soc_g_kg', sa.Float(), nullable=True),
    sa.Column('ph', sa.Float(), nullable=True),
    sa.Column('source', sa.String(length=300), nullable=False),
    sa.Column('retrieved_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.ForeignKeyConstraint(['field_id'], ['fields.id'], name=op.f('fk_soil_layers_field_id_fields'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_soil_layers'))
    )
    with op.batch_alter_table('soil_layers', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_soil_layers_field_id'), ['field_id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('soil_layers', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_soil_layers_field_id'))

    op.drop_table('soil_layers')
    with op.batch_alter_table('crop_history', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_crop_history_field_id'))

    op.drop_table('crop_history')
    with op.batch_alter_table('fields', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_fields_farm_id'))

    op.drop_table('fields')
    op.drop_table('farms')
