from sqlalchemy import Float, Index, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class BusLiveLocationRecord(Base):
    __tablename__ = "bus_live_location_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    trip_id: Mapped[str] = mapped_column(String(64), nullable=True)
    bus_id: Mapped[str] = mapped_column(String(64), nullable=True)
    plate_number: Mapped[str] = mapped_column(String(64), nullable=True)
    lat: Mapped[float] = mapped_column(Float, nullable=True)
    lng: Mapped[float] = mapped_column(Float, nullable=True)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_bus_live_location_records_trip_id", "trip_id", unique=True),
        Index("ix_bus_live_location_records_bus_id", "bus_id"),
        Index("ix_bus_live_location_records_updated_at", "updated_at"),
    )
