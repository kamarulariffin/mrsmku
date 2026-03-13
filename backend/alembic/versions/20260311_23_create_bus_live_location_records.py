"""create bus live location typed table

Revision ID: 20260311_23
Revises: 20260311_22
Create Date: 2026-03-12 11:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_23"
down_revision = "20260311_22"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bus_live_location_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("trip_id", sa.String(length=64), nullable=True),
        sa.Column("bus_id", sa.String(length=64), nullable=True),
        sa.Column("plate_number", sa.String(length=64), nullable=True),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lng", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_bus_live_location_records_trip_id",
        "bus_live_location_records",
        ["trip_id"],
        unique=True,
    )
    op.create_index(
        "ix_bus_live_location_records_bus_id",
        "bus_live_location_records",
        ["bus_id"],
        unique=False,
    )
    op.create_index(
        "ix_bus_live_location_records_updated_at",
        "bus_live_location_records",
        ["updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bus_live_location_records_updated_at",
        table_name="bus_live_location_records",
    )
    op.drop_index(
        "ix_bus_live_location_records_bus_id",
        table_name="bus_live_location_records",
    )
    op.drop_index(
        "ix_bus_live_location_records_trip_id",
        table_name="bus_live_location_records",
    )
    op.drop_table("bus_live_location_records")
