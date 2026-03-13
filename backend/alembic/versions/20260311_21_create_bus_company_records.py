"""create bus company typed table

Revision ID: 20260311_21
Revises: 20260311_20
Create Date: 2026-03-12 09:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_21"
down_revision = "20260311_20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bus_company_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("registration_number", sa.String(length=128), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=True),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("postcode", sa.String(length=16), nullable=True),
        sa.Column("city", sa.String(length=128), nullable=True),
        sa.Column("state", sa.String(length=128), nullable=True),
        sa.Column("director_name", sa.String(length=255), nullable=True),
        sa.Column("director_ic_passport", sa.String(length=64), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("pic_name", sa.String(length=255), nullable=False),
        sa.Column("pic_phone", sa.String(length=64), nullable=False),
        sa.Column("apad_license_no", sa.String(length=128), nullable=True),
        sa.Column("apad_expiry_date", sa.String(length=64), nullable=True),
        sa.Column("apad_document_url", sa.Text(), nullable=True),
        sa.Column("license_image_url", sa.Text(), nullable=True),
        sa.Column("permit_image_url", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.Column("application_status", sa.String(length=32), nullable=True),
        sa.Column("submitted_at", sa.String(length=64), nullable=True),
        sa.Column("reviewed_by", sa.String(length=64), nullable=True),
        sa.Column("approved_at", sa.String(length=64), nullable=True),
        sa.Column("officer_notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.String(length=64), nullable=True),
        sa.Column("verified_at", sa.String(length=64), nullable=True),
        sa.Column("verified_by", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_bus_company_records_registration_number",
        "bus_company_records",
        ["registration_number"],
        unique=True,
    )
    op.create_index(
        "ix_bus_company_records_email",
        "bus_company_records",
        ["email"],
        unique=False,
    )
    op.create_index(
        "ix_bus_company_records_application_status",
        "bus_company_records",
        ["application_status"],
        unique=False,
    )
    op.create_index(
        "ix_bus_company_records_is_active",
        "bus_company_records",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "ix_bus_company_records_is_verified",
        "bus_company_records",
        ["is_verified"],
        unique=False,
    )
    op.create_index(
        "ix_bus_company_records_status_active",
        "bus_company_records",
        ["application_status", "is_active"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bus_company_records_status_active",
        table_name="bus_company_records",
    )
    op.drop_index(
        "ix_bus_company_records_is_verified",
        table_name="bus_company_records",
    )
    op.drop_index(
        "ix_bus_company_records_is_active",
        table_name="bus_company_records",
    )
    op.drop_index(
        "ix_bus_company_records_application_status",
        table_name="bus_company_records",
    )
    op.drop_index(
        "ix_bus_company_records_email",
        table_name="bus_company_records",
    )
    op.drop_index(
        "ix_bus_company_records_registration_number",
        table_name="bus_company_records",
    )
    op.drop_table("bus_company_records")
