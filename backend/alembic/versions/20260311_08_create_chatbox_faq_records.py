"""create chatbox faq records table

Revision ID: 20260311_08
Revises: 20260311_07
Create Date: 2026-03-11 23:55:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_08"
down_revision = "20260311_07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chatbox_faq_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("order_value", sa.Integer(), nullable=False),
        sa.Column("attachments", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_chatbox_faq_records_order_value",
        "chatbox_faq_records",
        ["order_value"],
        unique=False,
    )
    op.create_index(
        "ix_chatbox_faq_records_updated_at",
        "chatbox_faq_records",
        ["updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_chatbox_faq_records_updated_at",
        table_name="chatbox_faq_records",
    )
    op.drop_index(
        "ix_chatbox_faq_records_order_value",
        table_name="chatbox_faq_records",
    )
    op.drop_table("chatbox_faq_records")
