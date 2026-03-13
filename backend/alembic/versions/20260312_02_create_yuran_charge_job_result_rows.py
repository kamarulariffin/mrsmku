"""create yuran charge job result rows table

Revision ID: 20260312_02
Revises: 20260312_01
Create Date: 2026-03-12 20:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260312_02"
down_revision = "20260312_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "yuran_charge_job_result_rows",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("job_id", sa.String(length=64), nullable=False),
        sa.Column("row_index", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("student_id", sa.String(length=64), nullable=True),
        sa.Column("student_name", sa.String(length=255), nullable=True),
        sa.Column("matric_number", sa.String(length=64), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("invoice_id", sa.String(length=64), nullable=True),
        sa.Column("delta_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(length=64), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_yuran_charge_job_result_rows_job_id",
        "yuran_charge_job_result_rows",
        ["job_id"],
        unique=False,
    )
    op.create_index(
        "ix_yuran_charge_job_result_rows_action",
        "yuran_charge_job_result_rows",
        ["action"],
        unique=False,
    )
    op.create_index(
        "ix_yuran_charge_job_result_rows_job_id_row_index",
        "yuran_charge_job_result_rows",
        ["job_id", "row_index"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_yuran_charge_job_result_rows_job_id_row_index",
        table_name="yuran_charge_job_result_rows",
    )
    op.drop_index(
        "ix_yuran_charge_job_result_rows_action",
        table_name="yuran_charge_job_result_rows",
    )
    op.drop_index(
        "ix_yuran_charge_job_result_rows_job_id",
        table_name="yuran_charge_job_result_rows",
    )
    op.drop_table("yuran_charge_job_result_rows")
