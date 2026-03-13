"""create pwa device token records table

Revision ID: 20260311_07
Revises: 20260308_06
Create Date: 2026-03-11 23:30:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_07"
down_revision = "20260308_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pwa_device_token_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("fcm_token", sa.Text(), nullable=False),
        sa.Column("device_type", sa.String(length=32), nullable=True),
        sa.Column("device_name", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_pwa_device_token_records_user_id",
        "pwa_device_token_records",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_pwa_device_token_records_updated_at",
        "pwa_device_token_records",
        ["updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_pwa_device_token_records_updated_at",
        table_name="pwa_device_token_records",
    )
    op.drop_index(
        "ix_pwa_device_token_records_user_id",
        table_name="pwa_device_token_records",
    )
    op.drop_table("pwa_device_token_records")
