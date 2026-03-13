"""create push log records table

Revision ID: 20260311_12
Revises: 20260311_11
Create Date: 2026-03-12 02:05:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_12"
down_revision = "20260311_11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_log_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("subscription_id", sa.String(length=64), nullable=True),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("reason", sa.String(length=128), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_push_log_records_subscription_id",
        "push_log_records",
        ["subscription_id"],
        unique=False,
    )
    op.create_index(
        "ix_push_log_records_user_id",
        "push_log_records",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_push_log_records_status",
        "push_log_records",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_push_log_records_created_at",
        "push_log_records",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_push_log_records_created_at",
        table_name="push_log_records",
    )
    op.drop_index(
        "ix_push_log_records_status",
        table_name="push_log_records",
    )
    op.drop_index(
        "ix_push_log_records_user_id",
        table_name="push_log_records",
    )
    op.drop_index(
        "ix_push_log_records_subscription_id",
        table_name="push_log_records",
    )
    op.drop_table("push_log_records")
