"""create payment reminder typed tables

Revision ID: 20260311_15
Revises: 20260311_14
Create Date: 2026-03-12 03:40:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_15"
down_revision = "20260311_14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_reminder_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("item_id", sa.String(length=128), nullable=True),
        sa.Column("student_id", sa.String(length=64), nullable=True),
        sa.Column("student_name", sa.String(length=255), nullable=True),
        sa.Column("set_name", sa.String(length=255), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("due_date", sa.String(length=64), nullable=True),
        sa.Column("remind_at", sa.String(length=64), nullable=True),
        sa.Column("days_before", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("sent_at", sa.String(length=64), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("next_retry_at", sa.String(length=64), nullable=True),
        sa.Column("retry_exhausted", sa.Boolean(), nullable=False),
        sa.Column("max_retries", sa.Integer(), nullable=False),
        sa.Column("final_failed_at", sa.String(length=64), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("cancelled_at", sa.String(length=64), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_payment_reminder_records_user_status_remind_at",
        "payment_reminder_records",
        ["user_id", "status", "remind_at"],
        unique=False,
    )
    op.create_index(
        "ix_payment_reminder_records_remind_at",
        "payment_reminder_records",
        ["remind_at"],
        unique=False,
    )
    op.create_index(
        "ix_payment_reminder_records_status",
        "payment_reminder_records",
        ["status"],
        unique=False,
    )

    op.create_table(
        "payment_reminder_preference_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("default_days_before", sa.Integer(), nullable=False),
        sa.Column("default_time", sa.String(length=5), nullable=False),
        sa.Column("default_source", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(
        "ix_payment_reminder_preference_records_user_id",
        "payment_reminder_preference_records",
        ["user_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_payment_reminder_preference_records_user_id",
        table_name="payment_reminder_preference_records",
    )
    op.drop_table("payment_reminder_preference_records")

    op.drop_index(
        "ix_payment_reminder_records_status",
        table_name="payment_reminder_records",
    )
    op.drop_index(
        "ix_payment_reminder_records_remind_at",
        table_name="payment_reminder_records",
    )
    op.drop_index(
        "ix_payment_reminder_records_user_status_remind_at",
        table_name="payment_reminder_records",
    )
    op.drop_table("payment_reminder_records")
