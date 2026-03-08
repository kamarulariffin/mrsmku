"""create relational student_yuran table

Revision ID: 20260307_03
Revises: 20260307_02
Create Date: 2026-03-07 22:05:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260307_03"
down_revision = "20260307_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "student_yuran_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("student_id", sa.String(length=64), nullable=True),
        sa.Column("parent_id", sa.String(length=64), nullable=True),
        sa.Column("set_yuran_id", sa.String(length=64), nullable=True),
        sa.Column("student_name", sa.String(length=255), nullable=True),
        sa.Column("matric_number", sa.String(length=128), nullable=True),
        sa.Column("tahun", sa.Integer(), nullable=False),
        sa.Column("tingkatan", sa.Integer(), nullable=False),
        sa.Column("set_yuran_nama", sa.String(length=255), nullable=True),
        sa.Column("religion", sa.String(length=64), nullable=True),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("payments", sa.JSON(), nullable=False),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column("paid_amount", sa.Float(), nullable=False),
        sa.Column("balance", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("due_date", sa.String(length=32), nullable=True),
        sa.Column("installment_plan", sa.JSON(), nullable=True),
        sa.Column("two_payment_plan", sa.JSON(), nullable=True),
        sa.Column("last_payment_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_student_yuran_records_student_id",
        "student_yuran_records",
        ["student_id"],
        unique=False,
    )
    op.create_index(
        "ix_student_yuran_records_parent_id",
        "student_yuran_records",
        ["parent_id"],
        unique=False,
    )
    op.create_index(
        "ix_student_yuran_records_set_yuran_id",
        "student_yuran_records",
        ["set_yuran_id"],
        unique=False,
    )
    op.create_index("ix_student_yuran_records_tahun", "student_yuran_records", ["tahun"], unique=False)
    op.create_index(
        "ix_student_yuran_records_tingkatan",
        "student_yuran_records",
        ["tingkatan"],
        unique=False,
    )
    op.create_index("ix_student_yuran_records_status", "student_yuran_records", ["status"], unique=False)
    op.create_index(
        "ix_student_yuran_records_tahun_tingkatan",
        "student_yuran_records",
        ["tahun", "tingkatan"],
        unique=False,
    )
    op.create_index(
        "ix_student_yuran_records_created_at",
        "student_yuran_records",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_student_yuran_records_created_at", table_name="student_yuran_records")
    op.drop_index("ix_student_yuran_records_tahun_tingkatan", table_name="student_yuran_records")
    op.drop_index("ix_student_yuran_records_status", table_name="student_yuran_records")
    op.drop_index("ix_student_yuran_records_tingkatan", table_name="student_yuran_records")
    op.drop_index("ix_student_yuran_records_tahun", table_name="student_yuran_records")
    op.drop_index("ix_student_yuran_records_set_yuran_id", table_name="student_yuran_records")
    op.drop_index("ix_student_yuran_records_parent_id", table_name="student_yuran_records")
    op.drop_index("ix_student_yuran_records_student_id", table_name="student_yuran_records")
    op.drop_table("student_yuran_records")
