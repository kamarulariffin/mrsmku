from sqlalchemy import Boolean, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class BusRecord(Base):
    __tablename__ = "bus_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    company_id: Mapped[str] = mapped_column(String(64), nullable=True)
    plate_number: Mapped[str] = mapped_column(String(64), nullable=False)
    bus_type: Mapped[str] = mapped_column(String(32), nullable=True)
    total_seats: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    brand: Mapped[str] = mapped_column(String(128), nullable=True)
    model: Mapped[str] = mapped_column(String(128), nullable=True)
    year: Mapped[int] = mapped_column(Integer, nullable=True)
    amenities_json: Mapped[list] = mapped_column("amenities", JSON, nullable=False, default=list)
    chassis_no: Mapped[str] = mapped_column(String(128), nullable=True)
    engine_no: Mapped[str] = mapped_column(String(128), nullable=True)
    year_manufactured: Mapped[int] = mapped_column(Integer, nullable=True)
    bus_category: Mapped[str] = mapped_column(String(64), nullable=True)
    color: Mapped[str] = mapped_column(String(64), nullable=True)
    ownership_status: Mapped[str] = mapped_column(String(64), nullable=True)
    operation_start_date: Mapped[str] = mapped_column(String(64), nullable=True)
    permit_no: Mapped[str] = mapped_column(String(128), nullable=True)
    permit_expiry: Mapped[str] = mapped_column(String(64), nullable=True)
    permit_document_url: Mapped[str] = mapped_column(Text, nullable=True)
    puspakom_date: Mapped[str] = mapped_column(String(64), nullable=True)
    puspakom_result: Mapped[str] = mapped_column(String(64), nullable=True)
    puspakom_document_url: Mapped[str] = mapped_column(Text, nullable=True)
    insurance_company: Mapped[str] = mapped_column(String(128), nullable=True)
    insurance_expiry: Mapped[str] = mapped_column(String(64), nullable=True)
    insurance_document_url: Mapped[str] = mapped_column(Text, nullable=True)
    geran_document_url: Mapped[str] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_bus_records_company_id", "company_id"),
        Index("ix_bus_records_plate_number", "plate_number", unique=True),
        Index("ix_bus_records_is_active", "is_active"),
        Index("ix_bus_records_bus_type", "bus_type"),
        Index("ix_bus_records_company_active", "company_id", "is_active"),
    )
