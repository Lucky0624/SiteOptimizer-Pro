from datetime import date, datetime, timezone

from sqlalchemy import Date, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class QuotaUsage(Base):
    __tablename__ = "quotausage"
    __table_args__ = (UniqueConstraint("api_type", "usage_date", name="uq_api_type_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    api_type: Mapped[str] = mapped_column(String)
    usage_date: Mapped[date] = mapped_column(Date, index=True)
    used_count: Mapped[int] = mapped_column(Integer, default=0)
    limit_count: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
