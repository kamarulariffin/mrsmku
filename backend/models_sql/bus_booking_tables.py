from sqlalchemy import Boolean, Float, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class BusBookingRecord(Base):
    __tablename__ = "bus_booking_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    booking_number: Mapped[str] = mapped_column(String(64), nullable=True)
    trip_id: Mapped[str] = mapped_column(String(64), nullable=True)
    student_id: Mapped[str] = mapped_column(String(64), nullable=True)
    parent_id: Mapped[str] = mapped_column(String(64), nullable=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=True)
    drop_off_point: Mapped[str] = mapped_column(String(255), nullable=True)
    drop_off_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    seat_preference: Mapped[str] = mapped_column(String(32), nullable=True)
    assigned_seat: Mapped[str] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=True)
    payment_status: Mapped[str] = mapped_column(String(32), nullable=True)
    pulang_bermalam_id: Mapped[str] = mapped_column(String(64), nullable=True)
    pulang_bermalam_approved: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    passengers: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    total_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    receipt_number: Mapped[str] = mapped_column(String(128), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=True)
    cancelled_at: Mapped[str] = mapped_column(String(64), nullable=True)
    cancellation_reason: Mapped[str] = mapped_column(Text, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_bus_booking_records_trip_id", "trip_id"),
        Index("ix_bus_booking_records_student_id", "student_id"),
        Index("ix_bus_booking_records_parent_id", "parent_id"),
        Index("ix_bus_booking_records_status", "status"),
        Index("ix_bus_booking_records_booking_number", "booking_number"),
        Index(
            "ix_bus_booking_records_trip_student_status",
            "trip_id",
            "student_id",
            "status",
        ),
        Index(
            "ix_bus_booking_records_trip_status_created_at",
            "trip_id",
            "status",
            "created_at",
        ),
    )
