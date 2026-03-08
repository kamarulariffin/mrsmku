"""create number sequence records table

Revision ID: 20260308_06
Revises: 20260307_05
Create Date: 2026-03-08 18:15:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260308_06"
down_revision = "20260307_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "number_sequence_records",
        sa.Column("sequence_key", sa.String(length=128), nullable=False),
        sa.Column("last_value", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("sequence_key"),
    )


def downgrade() -> None:
    op.drop_table("number_sequence_records")

