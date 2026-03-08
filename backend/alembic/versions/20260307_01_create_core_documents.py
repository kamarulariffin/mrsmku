"""create core_documents table

Revision ID: 20260307_01
Revises:
Create Date: 2026-03-07 12:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260307_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "core_documents",
        sa.Column("collection_name", sa.String(length=80), nullable=False),
        sa.Column("document_id", sa.String(length=64), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("collection_name", "document_id"),
    )
    op.create_index(
        "ix_core_documents_collection_name",
        "core_documents",
        ["collection_name"],
        unique=False,
    )
    op.create_index(
        "ix_core_documents_updated_at",
        "core_documents",
        ["updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_core_documents_updated_at", table_name="core_documents")
    op.drop_index("ix_core_documents_collection_name", table_name="core_documents")
    op.drop_table("core_documents")

