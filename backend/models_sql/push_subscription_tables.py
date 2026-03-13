from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class PushSubscriptionRecord(Base):
    __tablename__ = "push_subscription_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=True)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    keys_json: Mapped[dict] = mapped_column("keys", JSON, nullable=False, default=dict)
    device_info: Mapped[str] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_push_subscription_records_user_id", "user_id"),
        Index("ix_push_subscription_records_is_active", "is_active"),
        Index("ix_push_subscription_records_updated_at", "updated_at"),
    )
