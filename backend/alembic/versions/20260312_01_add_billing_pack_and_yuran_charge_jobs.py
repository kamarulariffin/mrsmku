"""add billing pack fields and yuran charge jobs table

Revision ID: 20260312_01
Revises: 20260311_23
Create Date: 2026-03-12 13:40:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260312_01"
down_revision = "20260311_23"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "student_yuran_records",
        sa.Column(
            "billing_pack_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "student_yuran_records",
        sa.Column(
            "billing_pack_mode",
            sa.String(length=16),
            nullable=False,
            server_default="single",
        ),
    )
    op.add_column(
        "student_yuran_records",
        sa.Column(
            "billing_packs",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    op.add_column(
        "student_yuran_records",
        sa.Column("charge_context", sa.JSON(), nullable=True),
    )
    op.create_index(
        "ix_student_yuran_records_pack_enabled",
        "student_yuran_records",
        ["billing_pack_enabled"],
        unique=False,
    )
    op.create_index(
        "ix_student_yuran_records_pack_mode",
        "student_yuran_records",
        ["billing_pack_mode"],
        unique=False,
    )

    op.create_table(
        "yuran_charge_job_records",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("job_number", sa.String(length=64), nullable=True),
        sa.Column("job_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("tahun", sa.Integer(), nullable=True),
        sa.Column("charge_type", sa.String(length=64), nullable=True),
        sa.Column("apply_mode", sa.String(length=64), nullable=True),
        sa.Column("charge_payload", sa.JSON(), nullable=False),
        sa.Column("target_summary", sa.JSON(), nullable=False),
        sa.Column("result_summary", sa.JSON(), nullable=False),
        sa.Column("result_rows", sa.JSON(), nullable=False),
        sa.Column("warnings", sa.JSON(), nullable=False),
        sa.Column("preview_id", sa.String(length=64), nullable=True),
        sa.Column("applied_job_id", sa.String(length=64), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_by_name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.String(length=64), nullable=True),
        sa.Column("started_at", sa.String(length=64), nullable=True),
        sa.Column("completed_at", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.Column("extra_data", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_yuran_charge_job_records_job_number",
        "yuran_charge_job_records",
        ["job_number"],
        unique=False,
    )
    op.create_index(
        "ix_yuran_charge_job_records_status",
        "yuran_charge_job_records",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_yuran_charge_job_records_tahun",
        "yuran_charge_job_records",
        ["tahun"],
        unique=False,
    )
    op.create_index(
        "ix_yuran_charge_job_records_charge_type",
        "yuran_charge_job_records",
        ["charge_type"],
        unique=False,
    )
    op.create_index(
        "ix_yuran_charge_job_records_created_by",
        "yuran_charge_job_records",
        ["created_by"],
        unique=False,
    )
    op.create_index(
        "ix_yuran_charge_job_records_created_at",
        "yuran_charge_job_records",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_yuran_charge_job_records_created_at",
        table_name="yuran_charge_job_records",
    )
    op.drop_index(
        "ix_yuran_charge_job_records_created_by",
        table_name="yuran_charge_job_records",
    )
    op.drop_index(
        "ix_yuran_charge_job_records_charge_type",
        table_name="yuran_charge_job_records",
    )
    op.drop_index(
        "ix_yuran_charge_job_records_tahun",
        table_name="yuran_charge_job_records",
    )
    op.drop_index(
        "ix_yuran_charge_job_records_status",
        table_name="yuran_charge_job_records",
    )
    op.drop_index(
        "ix_yuran_charge_job_records_job_number",
        table_name="yuran_charge_job_records",
    )
    op.drop_table("yuran_charge_job_records")

    op.drop_index(
        "ix_student_yuran_records_pack_mode",
        table_name="student_yuran_records",
    )
    op.drop_index(
        "ix_student_yuran_records_pack_enabled",
        table_name="student_yuran_records",
    )
    op.drop_column("student_yuran_records", "charge_context")
    op.drop_column("student_yuran_records", "billing_packs")
    op.drop_column("student_yuran_records", "billing_pack_mode")
    op.drop_column("student_yuran_records", "billing_pack_enabled")
