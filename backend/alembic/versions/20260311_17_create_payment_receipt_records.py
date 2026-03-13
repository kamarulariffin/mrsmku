"""create payment receipt typed table

Revision ID: 20260311_17
Revises: 20260311_16
Create Date: 2026-03-12 05:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_17"
down_revision = "20260311_16"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_receipt_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("receipt_number", sa.String(length=128), nullable=True),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("payer_name", sa.String(length=255), nullable=True),
        sa.Column("payer_email", sa.String(length=255), nullable=True),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column("payment_method", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(length=64), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_payment_receipt_records_user_id",
        "payment_receipt_records",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_payment_receipt_records_user_created_at",
        "payment_receipt_records",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_payment_receipt_records_receipt_number",
        "payment_receipt_records",
        ["receipt_number"],
        unique=False,
    )
    op.create_index(
        "ix_payment_receipt_records_status",
        "payment_receipt_records",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_payment_receipt_records_status",
        table_name="payment_receipt_records",
    )
    op.drop_index(
        "ix_payment_receipt_records_receipt_number",
        table_name="payment_receipt_records",
    )
    op.drop_index(
        "ix_payment_receipt_records_user_created_at",
        table_name="payment_receipt_records",
    )
    op.drop_index(
        "ix_payment_receipt_records_user_id",
        table_name="payment_receipt_records",
    )
    op.drop_table("payment_receipt_records")
