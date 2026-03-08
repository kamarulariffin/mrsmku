from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class NumberSequenceRecord(Base):
    """
    Generic atomic counter storage for business document numbers.
    Key format is free-form, e.g. "yuran.receipt.2026".
    """

    __tablename__ = "number_sequence_records"

    sequence_key: Mapped[str] = mapped_column(String(128), primary_key=True)
    last_value: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

