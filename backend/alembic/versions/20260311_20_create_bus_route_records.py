"""create bus route typed table

Revision ID: 20260311_20
Revises: 20260311_19
Create Date: 2026-03-12 07:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_20"
down_revision = "20260311_19"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bus_route_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("origin", sa.String(length=255), nullable=False),
        sa.Column("destination", sa.String(length=255), nullable=False),
        sa.Column("pickup_locations", sa.JSON(), nullable=False),
        sa.Column("drop_off_points", sa.JSON(), nullable=False),
        sa.Column("base_price", sa.Float(), nullable=False),
        sa.Column("estimated_duration", sa.String(length=128), nullable=True),
        sa.Column("distance_km", sa.Float(), nullable=True),
        sa.Column("trip_type", sa.String(length=32), nullable=True),
        sa.Column("return_route_id", sa.String(length=64), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_bus_route_records_company_id",
        "bus_route_records",
        ["company_id"],
        unique=False,
    )
    op.create_index(
        "ix_bus_route_records_is_active",
        "bus_route_records",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "ix_bus_route_records_trip_type",
        "bus_route_records",
        ["trip_type"],
        unique=False,
    )
    op.create_index(
        "ix_bus_route_records_return_route_id",
        "bus_route_records",
        ["return_route_id"],
        unique=False,
    )
    op.create_index(
        "ix_bus_route_records_company_active",
        "bus_route_records",
        ["company_id", "is_active"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bus_route_records_company_active",
        table_name="bus_route_records",
    )
    op.drop_index(
        "ix_bus_route_records_return_route_id",
        table_name="bus_route_records",
    )
    op.drop_index(
        "ix_bus_route_records_trip_type",
        table_name="bus_route_records",
    )
    op.drop_index(
        "ix_bus_route_records_is_active",
        table_name="bus_route_records",
    )
    op.drop_index(
        "ix_bus_route_records_company_id",
        table_name="bus_route_records",
    )
    op.drop_table("bus_route_records")
