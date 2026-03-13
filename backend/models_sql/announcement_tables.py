from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class AnnouncementRecord(Base):
    __tablename__ = "announcement_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(32), nullable=True)
    tingkatan: Mapped[str] = mapped_column(String(32), nullable=True)
    kelas: Mapped[str] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=True)
    send_push: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    send_email: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sent_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[str] = mapped_column(String(64), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_announcement_records_created_by", "created_by"),
        Index("ix_announcement_records_status", "status"),
        Index("ix_announcement_records_created_at", "created_at"),
    )
