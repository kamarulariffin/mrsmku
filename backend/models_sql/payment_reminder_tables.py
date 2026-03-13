from sqlalchemy import Boolean, Float, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class PaymentReminderRecord(Base):
    __tablename__ = "payment_reminder_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=True)
    item_id: Mapped[str] = mapped_column(String(128), nullable=True)
    student_id: Mapped[str] = mapped_column(String(64), nullable=True)
    student_name: Mapped[str] = mapped_column(String(255), nullable=True)
    set_name: Mapped[str] = mapped_column(String(255), nullable=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    due_date: Mapped[str] = mapped_column(String(64), nullable=True)
    remind_at: Mapped[str] = mapped_column(String(64), nullable=True)
    days_before: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source: Mapped[str] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=True)
    sent_at: Mapped[str] = mapped_column(String(64), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_retry_at: Mapped[str] = mapped_column(String(64), nullable=True)
    retry_exhausted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    final_failed_at: Mapped[str] = mapped_column(String(64), nullable=True)
    last_error: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=True)
    cancelled_at: Mapped[str] = mapped_column(String(64), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index(
            "ix_payment_reminder_records_user_status_remind_at",
            "user_id",
            "status",
            "remind_at",
        ),
        Index("ix_payment_reminder_records_remind_at", "remind_at"),
        Index("ix_payment_reminder_records_status", "status"),
    )


class PaymentReminderPreferenceRecord(Base):
    __tablename__ = "payment_reminder_preference_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    default_days_before: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    default_time: Mapped[str] = mapped_column(String(5), nullable=False, default="09:00")
    default_source: Mapped[str] = mapped_column(String(32), nullable=False, default="google_calendar")
    created_at: Mapped[str] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index(
            "ix_payment_reminder_preference_records_user_id",
            "user_id",
            unique=True,
        ),
    )
