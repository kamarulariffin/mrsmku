from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class SetYuranRecord(Base):
    __tablename__ = "set_yuran_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tahun: Mapped[int] = mapped_column(Integer, nullable=False)
    tingkatan: Mapped[int] = mapped_column(Integer, nullable=False)
    nama: Mapped[str] = mapped_column(String(255), nullable=False)
    categories: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_islam: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_bukan_islam: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(255), nullable=True)
    copied_from: Mapped[dict] = mapped_column(JSON, nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_set_yuran_records_tahun", "tahun"),
        Index("ix_set_yuran_records_tingkatan", "tingkatan"),
        Index("ix_set_yuran_records_active", "is_active"),
        Index("ix_set_yuran_records_tahun_tingkatan", "tahun", "tingkatan"),
    )


class YuranPaymentRecord(Base):
    __tablename__ = "yuran_payment_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_yuran_id: Mapped[str] = mapped_column(String(64), nullable=True)
    student_id: Mapped[str] = mapped_column(String(64), nullable=True)
    parent_id: Mapped[str] = mapped_column(String(64), nullable=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    payment_type: Mapped[str] = mapped_column(String(64), nullable=True)
    payment_method: Mapped[str] = mapped_column(String(64), nullable=True)
    receipt_number: Mapped[str] = mapped_column(String(128), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    category_paid: Mapped[str] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(64), nullable=True)
    payment_number: Mapped[int] = mapped_column(Integer, nullable=True)
    max_payments: Mapped[int] = mapped_column(Integer, nullable=True)
    excess_to_dana_kecemerlangan: Mapped[float] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    created_by: Mapped[str] = mapped_column(String(64), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_yuran_payment_records_receipt", "receipt_number"),
        Index("ix_yuran_payment_records_student_yuran_id", "student_yuran_id"),
        Index("ix_yuran_payment_records_student_id", "student_id"),
        Index("ix_yuran_payment_records_created_at", "created_at"),
    )


class StudentYuranRecord(Base):
    __tablename__ = "student_yuran_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(String(64), nullable=True)
    parent_id: Mapped[str] = mapped_column(String(64), nullable=True)
    set_yuran_id: Mapped[str] = mapped_column(String(64), nullable=True)
    student_name: Mapped[str] = mapped_column(String(255), nullable=True)
    matric_number: Mapped[str] = mapped_column(String(128), nullable=True)
    tahun: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tingkatan: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    set_yuran_nama: Mapped[str] = mapped_column(String(255), nullable=True)
    religion: Mapped[str] = mapped_column(String(64), nullable=True)
    items: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    payments: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    paid_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    balance: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    due_date: Mapped[str] = mapped_column(String(32), nullable=True)
    installment_plan: Mapped[dict] = mapped_column(JSON, nullable=True)
    two_payment_plan: Mapped[dict] = mapped_column(JSON, nullable=True)
    last_payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_student_yuran_records_student_id", "student_id"),
        Index("ix_student_yuran_records_parent_id", "parent_id"),
        Index("ix_student_yuran_records_set_yuran_id", "set_yuran_id"),
        Index("ix_student_yuran_records_tahun", "tahun"),
        Index("ix_student_yuran_records_tingkatan", "tingkatan"),
        Index("ix_student_yuran_records_status", "status"),
        Index("ix_student_yuran_records_tahun_tingkatan", "tahun", "tingkatan"),
        Index("ix_student_yuran_records_created_at", "created_at"),
    )
