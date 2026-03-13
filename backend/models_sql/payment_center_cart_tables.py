from sqlalchemy import Index, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class PaymentCenterCartRecord(Base):
    __tablename__ = "payment_center_cart_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    items_json: Mapped[list] = mapped_column("items", JSON, nullable=False, default=list)
    created_at: Mapped[str] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_payment_center_cart_records_user_id", "user_id", unique=True),
        Index("ix_payment_center_cart_records_updated_at", "updated_at"),
    )
