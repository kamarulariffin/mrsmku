"""create bus typed table

Revision ID: 20260311_22
Revises: 20260311_21
Create Date: 2026-03-12 10:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_22"
down_revision = "20260311_21"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bus_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=True),
        sa.Column("plate_number", sa.String(length=64), nullable=False),
        sa.Column("bus_type", sa.String(length=32), nullable=True),
        sa.Column("total_seats", sa.Integer(), nullable=False),
        sa.Column("brand", sa.String(length=128), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("amenities", sa.JSON(), nullable=False),
        sa.Column("chassis_no", sa.String(length=128), nullable=True),
        sa.Column("engine_no", sa.String(length=128), nullable=True),
        sa.Column("year_manufactured", sa.Integer(), nullable=True),
        sa.Column("bus_category", sa.String(length=64), nullable=True),
        sa.Column("color", sa.String(length=64), nullable=True),
        sa.Column("ownership_status", sa.String(length=64), nullable=True),
        sa.Column("operation_start_date", sa.String(length=64), nullable=True),
        sa.Column("permit_no", sa.String(length=128), nullable=True),
        sa.Column("permit_expiry", sa.String(length=64), nullable=True),
        sa.Column("permit_document_url", sa.Text(), nullable=True),
        sa.Column("puspakom_date", sa.String(length=64), nullable=True),
        sa.Column("puspakom_result", sa.String(length=64), nullable=True),
        sa.Column("puspakom_document_url", sa.Text(), nullable=True),
        sa.Column("insurance_company", sa.String(length=128), nullable=True),
        sa.Column("insurance_expiry", sa.String(length=64), nullable=True),
        sa.Column("insurance_document_url", sa.Text(), nullable=True),
        sa.Column("geran_document_url", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_bus_records_company_id",
        "bus_records",
        ["company_id"],
        unique=False,
    )
    op.create_index(
        "ix_bus_records_plate_number",
        "bus_records",
        ["plate_number"],
        unique=True,
    )
    op.create_index(
        "ix_bus_records_is_active",
        "bus_records",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "ix_bus_records_bus_type",
        "bus_records",
        ["bus_type"],
        unique=False,
    )
    op.create_index(
        "ix_bus_records_company_active",
        "bus_records",
        ["company_id", "is_active"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bus_records_company_active",
        table_name="bus_records",
    )
    op.drop_index(
        "ix_bus_records_bus_type",
        table_name="bus_records",
    )
    op.drop_index(
        "ix_bus_records_is_active",
        table_name="bus_records",
    )
    op.drop_index(
        "ix_bus_records_plate_number",
        table_name="bus_records",
    )
    op.drop_index(
        "ix_bus_records_company_id",
        table_name="bus_records",
    )
    op.drop_table("bus_records")
