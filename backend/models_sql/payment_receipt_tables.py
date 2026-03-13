from sqlalchemy import Float, Index, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class PaymentReceiptRecord(Base):
    __tablename__ = "payment_receipt_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    receipt_number: Mapped[str] = mapped_column(String(128), nullable=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=True)
    payer_name: Mapped[str] = mapped_column(String(255), nullable=True)
    payer_email: Mapped[str] = mapped_column(String(255), nullable=True)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    payment_method: Mapped[str] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=True)
    items_json: Mapped[list] = mapped_column("items", JSON, nullable=False, default=list)
    created_at: Mapped[str] = mapped_column(String(64), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_payment_receipt_records_user_id", "user_id"),
        Index(
            "ix_payment_receipt_records_user_created_at",
            "user_id",
            "created_at",
        ),
        Index("ix_payment_receipt_records_receipt_number", "receipt_number"),
        Index("ix_payment_receipt_records_status", "status"),
    )
