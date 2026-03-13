"""create email log records table

Revision ID: 20260311_13
Revises: 20260311_12
Create Date: 2026-03-12 02:40:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_13"
down_revision = "20260311_12"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_log_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("recipient", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("type", sa.String(length=64), nullable=True),
        sa.Column("subject", sa.Text(), nullable=True),
        sa.Column("template", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("email_id", sa.String(length=128), nullable=True),
        sa.Column("sent_by", sa.String(length=64), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_email_log_records_user_id",
        "email_log_records",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_email_log_records_recipient",
        "email_log_records",
        ["recipient"],
        unique=False,
    )
    op.create_index(
        "ix_email_log_records_status",
        "email_log_records",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_email_log_records_created_at",
        "email_log_records",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_email_log_records_created_at",
        table_name="email_log_records",
    )
    op.drop_index(
        "ix_email_log_records_status",
        table_name="email_log_records",
    )
    op.drop_index(
        "ix_email_log_records_recipient",
        table_name="email_log_records",
    )
    op.drop_index(
        "ix_email_log_records_user_id",
        table_name="email_log_records",
    )
    op.drop_table("email_log_records")
