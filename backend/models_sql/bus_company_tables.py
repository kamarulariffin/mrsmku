from sqlalchemy import Boolean, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class BusCompanyRecord(Base):
    __tablename__ = "bus_company_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    registration_number: Mapped[str] = mapped_column(String(128), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    postcode: Mapped[str] = mapped_column(String(16), nullable=True)
    city: Mapped[str] = mapped_column(String(128), nullable=True)
    state: Mapped[str] = mapped_column(String(128), nullable=True)
    director_name: Mapped[str] = mapped_column(String(255), nullable=True)
    director_ic_passport: Mapped[str] = mapped_column(String(64), nullable=True)
    phone: Mapped[str] = mapped_column(String(64), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    pic_name: Mapped[str] = mapped_column(String(255), nullable=False)
    pic_phone: Mapped[str] = mapped_column(String(64), nullable=False)
    apad_license_no: Mapped[str] = mapped_column(String(128), nullable=True)
    apad_expiry_date: Mapped[str] = mapped_column(String(64), nullable=True)
    apad_document_url: Mapped[str] = mapped_column(Text, nullable=True)
    license_image_url: Mapped[str] = mapped_column(Text, nullable=True)
    permit_image_url: Mapped[str] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    application_status: Mapped[str] = mapped_column(String(32), nullable=True)
    submitted_at: Mapped[str] = mapped_column(String(64), nullable=True)
    reviewed_by: Mapped[str] = mapped_column(String(64), nullable=True)
    approved_at: Mapped[str] = mapped_column(String(64), nullable=True)
    officer_notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=True)
    verified_at: Mapped[str] = mapped_column(String(64), nullable=True)
    verified_by: Mapped[str] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index(
            "ix_bus_company_records_registration_number",
            "registration_number",
            unique=True,
        ),
        Index("ix_bus_company_records_email", "email"),
        Index("ix_bus_company_records_application_status", "application_status"),
        Index("ix_bus_company_records_is_active", "is_active"),
        Index("ix_bus_company_records_is_verified", "is_verified"),
        Index(
            "ix_bus_company_records_status_active",
            "application_status",
            "is_active",
        ),
    )
