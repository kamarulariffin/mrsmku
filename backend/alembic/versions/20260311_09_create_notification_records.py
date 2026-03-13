"""create notification records table

Revision ID: 20260311_09
Revises: 20260311_08
Create Date: 2026-03-12 00:25:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_09"
down_revision = "20260311_08"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("type", sa.String(length=64), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=True),
        sa.Column("priority", sa.String(length=32), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("action_url", sa.Text(), nullable=True),
        sa.Column("action_label", sa.String(length=128), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("sender_id", sa.String(length=64), nullable=True),
        sa.Column("sender_name", sa.String(length=255), nullable=True),
        sa.Column("sender_role", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_notification_records_user_id",
        "notification_records",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_records_is_read",
        "notification_records",
        ["is_read"],
        unique=False,
    )
    op.create_index(
        "ix_notification_records_created_at",
        "notification_records",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notification_records_created_at",
        table_name="notification_records",
    )
    op.drop_index(
        "ix_notification_records_is_read",
        table_name="notification_records",
    )
    op.drop_index(
        "ix_notification_records_user_id",
        table_name="notification_records",
    )
    op.drop_table("notification_records")
