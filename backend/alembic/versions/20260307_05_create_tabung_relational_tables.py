"""create tabung relational tables

Revision ID: 20260307_05
Revises: 20260307_04
Create Date: 2026-03-08 00:40:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260307_05"
down_revision = "20260307_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tabung_campaign_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("full_description", sa.Text(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("images", sa.JSON(), nullable=False),
        sa.Column("campaign_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("donor_count", sa.Integer(), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False),
        sa.Column("allow_anonymous", sa.Boolean(), nullable=False),
        sa.Column("is_featured", sa.Boolean(), nullable=False),
        sa.Column("is_permanent", sa.Boolean(), nullable=False),
        sa.Column("start_date", sa.String(length=64), nullable=True),
        sa.Column("end_date", sa.String(length=64), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_slots", sa.Integer(), nullable=True),
        sa.Column("slots_sold", sa.Integer(), nullable=True),
        sa.Column("price_per_slot", sa.Float(), nullable=True),
        sa.Column("min_slots", sa.Integer(), nullable=True),
        sa.Column("max_slots", sa.Integer(), nullable=True),
        sa.Column("target_amount", sa.Float(), nullable=True),
        sa.Column("collected_amount", sa.Float(), nullable=True),
        sa.Column("min_amount", sa.Float(), nullable=True),
        sa.Column("max_amount", sa.Float(), nullable=True),
        sa.Column("qr_code_base64", sa.Text(), nullable=True),
        sa.Column("qr_code_url", sa.Text(), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_tabung_campaign_records_campaign_type",
        "tabung_campaign_records",
        ["campaign_type"],
        unique=False,
    )
    op.create_index(
        "ix_tabung_campaign_records_status",
        "tabung_campaign_records",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_tabung_campaign_records_created_at",
        "tabung_campaign_records",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_tabung_campaign_records_is_featured",
        "tabung_campaign_records",
        ["is_featured"],
        unique=False,
    )
    op.create_index(
        "ix_tabung_campaign_records_is_public",
        "tabung_campaign_records",
        ["is_public"],
        unique=False,
    )

    op.create_table(
        "tabung_donation_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("campaign_id", sa.String(length=64), nullable=True),
        sa.Column("campaign_title", sa.String(length=255), nullable=True),
        sa.Column("campaign_type", sa.String(length=32), nullable=True),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("donor_name", sa.String(length=255), nullable=True),
        sa.Column("donor_email", sa.String(length=255), nullable=True),
        sa.Column("is_anonymous", sa.Boolean(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("payment_method", sa.String(length=64), nullable=True),
        sa.Column("payment_status", sa.String(length=32), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("receipt_number", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("slots", sa.Integer(), nullable=True),
        sa.Column("price_per_slot", sa.Float(), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_tabung_donation_records_campaign_id",
        "tabung_donation_records",
        ["campaign_id"],
        unique=False,
    )
    op.create_index(
        "ix_tabung_donation_records_user_id",
        "tabung_donation_records",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_tabung_donation_records_payment_status",
        "tabung_donation_records",
        ["payment_status"],
        unique=False,
    )
    op.create_index(
        "ix_tabung_donation_records_created_at",
        "tabung_donation_records",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_tabung_donation_records_receipt_number",
        "tabung_donation_records",
        ["receipt_number"],
        unique=False,
    )
    op.create_index(
        "ix_tabung_donation_records_campaign_type",
        "tabung_donation_records",
        ["campaign_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_tabung_donation_records_campaign_type",
        table_name="tabung_donation_records",
    )
    op.drop_index(
        "ix_tabung_donation_records_receipt_number",
        table_name="tabung_donation_records",
    )
    op.drop_index(
        "ix_tabung_donation_records_created_at",
        table_name="tabung_donation_records",
    )
    op.drop_index(
        "ix_tabung_donation_records_payment_status",
        table_name="tabung_donation_records",
    )
    op.drop_index(
        "ix_tabung_donation_records_user_id",
        table_name="tabung_donation_records",
    )
    op.drop_index(
        "ix_tabung_donation_records_campaign_id",
        table_name="tabung_donation_records",
    )
    op.drop_table("tabung_donation_records")

    op.drop_index(
        "ix_tabung_campaign_records_is_public",
        table_name="tabung_campaign_records",
    )
    op.drop_index(
        "ix_tabung_campaign_records_is_featured",
        table_name="tabung_campaign_records",
    )
    op.drop_index(
        "ix_tabung_campaign_records_created_at",
        table_name="tabung_campaign_records",
    )
    op.drop_index(
        "ix_tabung_campaign_records_status",
        table_name="tabung_campaign_records",
    )
    op.drop_index(
        "ix_tabung_campaign_records_campaign_type",
        table_name="tabung_campaign_records",
    )
    op.drop_table("tabung_campaign_records")
