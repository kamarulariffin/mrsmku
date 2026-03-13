from sqlalchemy import Float, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class YuranChargeJobRecord(Base):
    __tablename__ = "yuran_charge_job_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    job_number: Mapped[str] = mapped_column(String(64), nullable=True)
    job_type: Mapped[str] = mapped_column(String(64), nullable=False, default="yuran_charge_bulk")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="previewed")
    tahun: Mapped[int] = mapped_column(Integer, nullable=True)
    charge_type: Mapped[str] = mapped_column(String(64), nullable=True)
    apply_mode: Mapped[str] = mapped_column(String(64), nullable=True)
    charge_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    target_summary: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    result_summary: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    result_rows: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    warnings: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    preview_id: Mapped[str] = mapped_column(String(64), nullable=True)
    applied_job_id: Mapped[str] = mapped_column(String(64), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=True)
    started_at: Mapped[str] = mapped_column(String(64), nullable=True)
    completed_at: Mapped[str] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_yuran_charge_job_records_job_number", "job_number", unique=False),
        Index("ix_yuran_charge_job_records_status", "status"),
        Index("ix_yuran_charge_job_records_tahun", "tahun"),
        Index("ix_yuran_charge_job_records_charge_type", "charge_type"),
        Index("ix_yuran_charge_job_records_created_by", "created_by"),
        Index("ix_yuran_charge_job_records_created_at", "created_at"),
    )


class YuranChargeJobResultRowRecord(Base):
    __tablename__ = "yuran_charge_job_result_rows"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    job_id: Mapped[str] = mapped_column(String(64), nullable=False)
    row_index: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    student_id: Mapped[str] = mapped_column(String(64), nullable=True)
    student_name: Mapped[str] = mapped_column(String(255), nullable=True)
    matric_number: Mapped[str] = mapped_column(String(64), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    invoice_id: Mapped[str] = mapped_column(String(64), nullable=True)
    delta_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        Index("ix_yuran_charge_job_result_rows_job_id", "job_id"),
        Index("ix_yuran_charge_job_result_rows_action", "action"),
        Index("ix_yuran_charge_job_result_rows_job_id_row_index", "job_id", "row_index", unique=True),
    )
