"""create announcement records table

Revision ID: 20260311_10
Revises: 20260311_09
Create Date: 2026-03-12 01:05:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_10"
down_revision = "20260311_09"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "announcement_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(length=32), nullable=True),
        sa.Column("tingkatan", sa.String(length=32), nullable=True),
        sa.Column("kelas", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("send_push", sa.Boolean(), nullable=False),
        sa.Column("send_email", sa.Boolean(), nullable=False),
        sa.Column("sent_count", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_by_name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_announcement_records_created_by",
        "announcement_records",
        ["created_by"],
        unique=False,
    )
    op.create_index(
        "ix_announcement_records_status",
        "announcement_records",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_announcement_records_created_at",
        "announcement_records",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_announcement_records_created_at",
        table_name="announcement_records",
    )
    op.drop_index(
        "ix_announcement_records_status",
        table_name="announcement_records",
    )
    op.drop_index(
        "ix_announcement_records_created_by",
        table_name="announcement_records",
    )
    op.drop_table("announcement_records")
