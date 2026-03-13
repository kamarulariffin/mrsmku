from sqlalchemy import Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class BusTripRecord(Base):
    __tablename__ = "bus_trip_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    route_id: Mapped[str] = mapped_column(String(64), nullable=True)
    bus_id: Mapped[str] = mapped_column(String(64), nullable=True)
    departure_date: Mapped[str] = mapped_column(String(64), nullable=True)
    departure_time: Mapped[str] = mapped_column(String(32), nullable=True)
    return_date: Mapped[str] = mapped_column(String(64), nullable=True)
    return_time: Mapped[str] = mapped_column(String(32), nullable=True)
    available_seats: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(32), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=True)
    cancelled_at: Mapped[str] = mapped_column(String(64), nullable=True)
    cancellation_reason: Mapped[str] = mapped_column(Text, nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_bus_trip_records_route_id", "route_id"),
        Index("ix_bus_trip_records_bus_id", "bus_id"),
        Index("ix_bus_trip_records_status", "status"),
        Index("ix_bus_trip_records_departure_date", "departure_date"),
        Index("ix_bus_trip_records_status_departure_date", "status", "departure_date"),
        Index(
            "ix_bus_trip_records_bus_departure_status",
            "bus_id",
            "departure_date",
            "status",
        ),
    )
