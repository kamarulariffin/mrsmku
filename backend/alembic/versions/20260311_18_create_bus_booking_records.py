"""create bus booking typed table

Revision ID: 20260311_18
Revises: 20260311_17
Create Date: 2026-03-12 05:45:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_18"
down_revision = "20260311_17"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bus_booking_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("booking_number", sa.String(length=64), nullable=True),
        sa.Column("trip_id", sa.String(length=64), nullable=True),
        sa.Column("student_id", sa.String(length=64), nullable=True),
        sa.Column("parent_id", sa.String(length=64), nullable=True),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("drop_off_point", sa.String(length=255), nullable=True),
        sa.Column("drop_off_price", sa.Float(), nullable=False),
        sa.Column("seat_preference", sa.String(length=32), nullable=True),
        sa.Column("assigned_seat", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("payment_status", sa.String(length=32), nullable=True),
        sa.Column("pulang_bermalam_id", sa.String(length=64), nullable=True),
        sa.Column("pulang_bermalam_approved", sa.Boolean(), nullable=False),
        sa.Column("passengers", sa.Integer(), nullable=False),
        sa.Column("total_price", sa.Float(), nullable=False),
        sa.Column("receipt_number", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("cancelled_at", sa.String(length=64), nullable=True),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_bus_booking_records_trip_id",
        "bus_booking_records",
        ["trip_id"],
        unique=False,
    )
    op.create_index(
        "ix_bus_booking_records_student_id",
        "bus_booking_records",
        ["student_id"],
        unique=False,
    )
    op.create_index(
        "ix_bus_booking_records_parent_id",
        "bus_booking_records",
        ["parent_id"],
        unique=False,
    )
    op.create_index(
        "ix_bus_booking_records_status",
        "bus_booking_records",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_bus_booking_records_booking_number",
        "bus_booking_records",
        ["booking_number"],
        unique=False,
    )
    op.create_index(
        "ix_bus_booking_records_trip_student_status",
        "bus_booking_records",
        ["trip_id", "student_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_bus_booking_records_trip_status_created_at",
        "bus_booking_records",
        ["trip_id", "status", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bus_booking_records_trip_status_created_at",
        table_name="bus_booking_records",
    )
    op.drop_index(
        "ix_bus_booking_records_trip_student_status",
        table_name="bus_booking_records",
    )
    op.drop_index(
        "ix_bus_booking_records_booking_number",
        table_name="bus_booking_records",
    )
    op.drop_index(
        "ix_bus_booking_records_status",
        table_name="bus_booking_records",
    )
    op.drop_index(
        "ix_bus_booking_records_parent_id",
        table_name="bus_booking_records",
    )
    op.drop_index(
        "ix_bus_booking_records_student_id",
        table_name="bus_booking_records",
    )
    op.drop_index(
        "ix_bus_booking_records_trip_id",
        table_name="bus_booking_records",
    )
    op.drop_table("bus_booking_records")
