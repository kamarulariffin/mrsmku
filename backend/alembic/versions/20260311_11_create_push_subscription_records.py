"""create push subscription records table

Revision ID: 20260311_11
Revises: 20260311_10
Create Date: 2026-03-12 01:40:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_11"
down_revision = "20260311_10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_subscription_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("keys", sa.JSON(), nullable=False),
        sa.Column("device_info", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_push_subscription_records_user_id",
        "push_subscription_records",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_push_subscription_records_is_active",
        "push_subscription_records",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "ix_push_subscription_records_updated_at",
        "push_subscription_records",
        ["updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_push_subscription_records_updated_at",
        table_name="push_subscription_records",
    )
    op.drop_index(
        "ix_push_subscription_records_is_active",
        table_name="push_subscription_records",
    )
    op.drop_index(
        "ix_push_subscription_records_user_id",
        table_name="push_subscription_records",
    )
    op.drop_table("push_subscription_records")
