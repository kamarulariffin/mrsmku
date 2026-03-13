"""create email template records table

Revision ID: 20260311_14
Revises: 20260311_13
Create Date: 2026-03-12 03:10:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_14"
down_revision = "20260311_13"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_template_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("template_key", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("subject", sa.Text(), nullable=True),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("variables", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("tingkatan", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_email_template_records_template_key",
        "email_template_records",
        ["template_key"],
        unique=False,
    )
    op.create_index(
        "ix_email_template_records_is_active",
        "email_template_records",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "ix_email_template_records_tingkatan",
        "email_template_records",
        ["tingkatan"],
        unique=False,
    )
    op.create_index(
        "ix_email_template_records_updated_at",
        "email_template_records",
        ["updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_email_template_records_updated_at",
        table_name="email_template_records",
    )
    op.drop_index(
        "ix_email_template_records_tingkatan",
        table_name="email_template_records",
    )
    op.drop_index(
        "ix_email_template_records_is_active",
        table_name="email_template_records",
    )
    op.drop_index(
        "ix_email_template_records_template_key",
        table_name="email_template_records",
    )
    op.drop_table("email_template_records")
