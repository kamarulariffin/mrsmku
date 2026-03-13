"""create payment center cart typed table

Revision ID: 20260311_16
Revises: 20260311_15
Create Date: 2026-03-12 04:20:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_16"
down_revision = "20260311_15"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_center_cart_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(
        "ix_payment_center_cart_records_user_id",
        "payment_center_cart_records",
        ["user_id"],
        unique=True,
    )
    op.create_index(
        "ix_payment_center_cart_records_updated_at",
        "payment_center_cart_records",
        ["updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_payment_center_cart_records_updated_at",
        table_name="payment_center_cart_records",
    )
    op.drop_index(
        "ix_payment_center_cart_records_user_id",
        table_name="payment_center_cart_records",
    )
    op.drop_table("payment_center_cart_records")
