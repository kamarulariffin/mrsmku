"""create financial dashboard cache records

Revision ID: 20260307_04
Revises: 20260307_03
Create Date: 2026-03-07 23:10:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260307_04"
down_revision = "20260307_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "financial_dashboard_cache_records",
        sa.Column("cache_key", sa.String(length=255), nullable=False),
        sa.Column("endpoint", sa.String(length=80), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("cache_key"),
    )
    op.create_index(
        "ix_financial_dashboard_cache_records_endpoint",
        "financial_dashboard_cache_records",
        ["endpoint"],
        unique=False,
    )
    op.create_index(
        "ix_financial_dashboard_cache_records_expires_at",
        "financial_dashboard_cache_records",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_financial_dashboard_cache_records_expires_at",
        table_name="financial_dashboard_cache_records",
    )
    op.drop_index(
        "ix_financial_dashboard_cache_records_endpoint",
        table_name="financial_dashboard_cache_records",
    )
    op.drop_table("financial_dashboard_cache_records")
