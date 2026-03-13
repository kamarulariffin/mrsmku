from sqlalchemy import Boolean, Float, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class BusRouteRecord(Base):
    __tablename__ = "bus_route_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    company_id: Mapped[str] = mapped_column(String(64), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    origin: Mapped[str] = mapped_column(String(255), nullable=False)
    destination: Mapped[str] = mapped_column(String(255), nullable=False)
    pickup_locations_json: Mapped[list] = mapped_column("pickup_locations", JSON, nullable=False, default=list)
    drop_off_points_json: Mapped[list] = mapped_column("drop_off_points", JSON, nullable=False, default=list)
    base_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    estimated_duration: Mapped[str] = mapped_column(String(128), nullable=True)
    distance_km: Mapped[float] = mapped_column(Float, nullable=True)
    trip_type: Mapped[str] = mapped_column(String(32), nullable=True)
    return_route_id: Mapped[str] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_bus_route_records_company_id", "company_id"),
        Index("ix_bus_route_records_is_active", "is_active"),
        Index("ix_bus_route_records_trip_type", "trip_type"),
        Index("ix_bus_route_records_return_route_id", "return_route_id"),
        Index("ix_bus_route_records_company_active", "company_id", "is_active"),
    )
