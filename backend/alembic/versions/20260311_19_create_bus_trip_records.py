"""create bus trip typed table

Revision ID: 20260311_19
Revises: 20260311_18
Create Date: 2026-03-12 06:30:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_19"
down_revision = "20260311_18"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bus_trip_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("route_id", sa.String(length=64), nullable=True),
        sa.Column("bus_id", sa.String(length=64), nullable=True),
        sa.Column("departure_date", sa.String(length=64), nullable=True),
        sa.Column("departure_time", sa.String(length=32), nullable=True),
        sa.Column("return_date", sa.String(length=64), nullable=True),
        sa.Column("return_time", sa.String(length=32), nullable=True),
        sa.Column("available_seats", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("cancelled_at", sa.String(length=64), nullable=True),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_bus_trip_records_route_id",
        "bus_trip_records",
        ["route_id"],
        unique=False,
    )
    op.create_index(
        "ix_bus_trip_records_bus_id",
        "bus_trip_records",
        ["bus_id"],
        unique=False,
    )
    op.create_index(
        "ix_bus_trip_records_status",
        "bus_trip_records",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_bus_trip_records_departure_date",
        "bus_trip_records",
        ["departure_date"],
        unique=False,
    )
    op.create_index(
        "ix_bus_trip_records_status_departure_date",
        "bus_trip_records",
        ["status", "departure_date"],
        unique=False,
    )
    op.create_index(
        "ix_bus_trip_records_bus_departure_status",
        "bus_trip_records",
        ["bus_id", "departure_date", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bus_trip_records_bus_departure_status",
        table_name="bus_trip_records",
    )
    op.drop_index(
        "ix_bus_trip_records_status_departure_date",
        table_name="bus_trip_records",
    )
    op.drop_index(
        "ix_bus_trip_records_departure_date",
        table_name="bus_trip_records",
    )
    op.drop_index(
        "ix_bus_trip_records_status",
        table_name="bus_trip_records",
    )
    op.drop_index(
        "ix_bus_trip_records_bus_id",
        table_name="bus_trip_records",
    )
    op.drop_index(
        "ix_bus_trip_records_route_id",
        table_name="bus_trip_records",
    )
    op.drop_table("bus_trip_records")
