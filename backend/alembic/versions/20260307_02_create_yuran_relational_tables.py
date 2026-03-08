"""create relational yuran tables

Revision ID: 20260307_02
Revises: 20260307_01
Create Date: 2026-03-07 21:30:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260307_02"
down_revision = "20260307_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "set_yuran_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("tahun", sa.Integer(), nullable=False),
        sa.Column("tingkatan", sa.Integer(), nullable=False),
        sa.Column("nama", sa.String(length=255), nullable=False),
        sa.Column("categories", sa.JSON(), nullable=False),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column("total_islam", sa.Float(), nullable=False),
        sa.Column("total_bukan_islam", sa.Float(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_by_name", sa.String(length=255), nullable=True),
        sa.Column("copied_from", sa.JSON(), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_set_yuran_records_tahun", "set_yuran_records", ["tahun"], unique=False)
    op.create_index("ix_set_yuran_records_tingkatan", "set_yuran_records", ["tingkatan"], unique=False)
    op.create_index("ix_set_yuran_records_active", "set_yuran_records", ["is_active"], unique=False)
    op.create_index(
        "ix_set_yuran_records_tahun_tingkatan",
        "set_yuran_records",
        ["tahun", "tingkatan"],
        unique=False,
    )

    op.create_table(
        "yuran_payment_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("student_yuran_id", sa.String(length=64), nullable=True),
        sa.Column("student_id", sa.String(length=64), nullable=True),
        sa.Column("parent_id", sa.String(length=64), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("payment_type", sa.String(length=64), nullable=True),
        sa.Column("payment_method", sa.String(length=64), nullable=True),
        sa.Column("receipt_number", sa.String(length=128), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category_paid", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=64), nullable=True),
        sa.Column("payment_number", sa.Integer(), nullable=True),
        sa.Column("max_payments", sa.Integer(), nullable=True),
        sa.Column("excess_to_dana_kecemerlangan", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_yuran_payment_records_receipt",
        "yuran_payment_records",
        ["receipt_number"],
        unique=False,
    )
    op.create_index(
        "ix_yuran_payment_records_student_yuran_id",
        "yuran_payment_records",
        ["student_yuran_id"],
        unique=False,
    )
    op.create_index(
        "ix_yuran_payment_records_student_id",
        "yuran_payment_records",
        ["student_id"],
        unique=False,
    )
    op.create_index(
        "ix_yuran_payment_records_created_at",
        "yuran_payment_records",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_yuran_payment_records_created_at", table_name="yuran_payment_records")
    op.drop_index("ix_yuran_payment_records_student_id", table_name="yuran_payment_records")
    op.drop_index("ix_yuran_payment_records_student_yuran_id", table_name="yuran_payment_records")
    op.drop_index("ix_yuran_payment_records_receipt", table_name="yuran_payment_records")
    op.drop_table("yuran_payment_records")

    op.drop_index("ix_set_yuran_records_tahun_tingkatan", table_name="set_yuran_records")
    op.drop_index("ix_set_yuran_records_active", table_name="set_yuran_records")
    op.drop_index("ix_set_yuran_records_tingkatan", table_name="set_yuran_records")
    op.drop_index("ix_set_yuran_records_tahun", table_name="set_yuran_records")
    op.drop_table("set_yuran_records")
