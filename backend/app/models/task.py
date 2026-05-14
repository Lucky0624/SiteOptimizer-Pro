from datetime import date, datetime, timezone

from sqlalchemy import Date, Float, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TaskQueue(Base):
    __tablename__ = "taskqueue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url_id: Mapped[int] = mapped_column(Integer, ForeignKey("urlrecord.id"))
    task_type: Mapped[str] = mapped_column(String)
    priority_score: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String, default="pending")
    scheduled_date: Mapped[date] = mapped_column(Date)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=3)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    url_record: Mapped["URLRecord"] = relationship(back_populates="tasks")
