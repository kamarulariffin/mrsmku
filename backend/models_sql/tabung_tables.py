from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class TabungCampaignRecord(Base):
    __tablename__ = "tabung_campaign_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    full_description: Mapped[str] = mapped_column(Text, nullable=True)
    image_url: Mapped[str] = mapped_column(Text, nullable=True)
    images: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    campaign_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    donor_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allow_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_permanent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    start_date: Mapped[str] = mapped_column(String(64), nullable=True)
    end_date: Mapped[str] = mapped_column(String(64), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    total_slots: Mapped[int] = mapped_column(Integer, nullable=True)
    slots_sold: Mapped[int] = mapped_column(Integer, nullable=True)
    price_per_slot: Mapped[float] = mapped_column(Float, nullable=True)
    min_slots: Mapped[int] = mapped_column(Integer, nullable=True)
    max_slots: Mapped[int] = mapped_column(Integer, nullable=True)

    target_amount: Mapped[float] = mapped_column(Float, nullable=True)
    collected_amount: Mapped[float] = mapped_column(Float, nullable=True)
    min_amount: Mapped[float] = mapped_column(Float, nullable=True)
    max_amount: Mapped[float] = mapped_column(Float, nullable=True)

    qr_code_base64: Mapped[str] = mapped_column(Text, nullable=True)
    qr_code_url: Mapped[str] = mapped_column(Text, nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_tabung_campaign_records_campaign_type", "campaign_type"),
        Index("ix_tabung_campaign_records_status", "status"),
        Index("ix_tabung_campaign_records_created_at", "created_at"),
        Index("ix_tabung_campaign_records_is_featured", "is_featured"),
        Index("ix_tabung_campaign_records_is_public", "is_public"),
    )


class TabungDonationRecord(Base):
    __tablename__ = "tabung_donation_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    campaign_id: Mapped[str] = mapped_column(String(64), nullable=True)
    campaign_title: Mapped[str] = mapped_column(String(255), nullable=True)
    campaign_type: Mapped[str] = mapped_column(String(32), nullable=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=True)
    donor_name: Mapped[str] = mapped_column(String(255), nullable=True)
    donor_email: Mapped[str] = mapped_column(String(255), nullable=True)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    payment_method: Mapped[str] = mapped_column(String(64), nullable=True)
    payment_status: Mapped[str] = mapped_column(String(32), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=True)
    receipt_number: Mapped[str] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    slots: Mapped[int] = mapped_column(Integer, nullable=True)
    price_per_slot: Mapped[float] = mapped_column(Float, nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_tabung_donation_records_campaign_id", "campaign_id"),
        Index("ix_tabung_donation_records_user_id", "user_id"),
        Index("ix_tabung_donation_records_payment_status", "payment_status"),
        Index("ix_tabung_donation_records_created_at", "created_at"),
        Index("ix_tabung_donation_records_receipt_number", "receipt_number"),
        Index("ix_tabung_donation_records_campaign_type", "campaign_type"),
    )
