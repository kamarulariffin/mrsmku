from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class EmailLogRecord(Base):
    __tablename__ = "email_log_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=True)
    recipient: Mapped[str] = mapped_column(String(255), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    type: Mapped[str] = mapped_column(String(64), nullable=True)
    subject: Mapped[str] = mapped_column(Text, nullable=True)
    template: Mapped[str] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=True)
    email_id: Mapped[str] = mapped_column(String(128), nullable=True)
    sent_by: Mapped[str] = mapped_column(String(64), nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    error: Mapped[str] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default=dict)
    data_json: Mapped[dict] = mapped_column("data", JSON, nullable=False, default=dict)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_email_log_records_user_id", "user_id"),
        Index("ix_email_log_records_recipient", "recipient"),
        Index("ix_email_log_records_status", "status"),
        Index("ix_email_log_records_created_at", "created_at"),
    )
