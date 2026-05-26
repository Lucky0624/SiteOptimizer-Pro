from datetime import datetime, timezone
from sqlalchemy import Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AlertLog(Base):
    """告警历史记录，用于防抖（避免同类告警在短时间内重复发送）"""
    __tablename__ = "alertlog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_type: Mapped[str] = mapped_column(String(100), index=True)
    message: Mapped[str] = mapped_column(Text)
    website_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("website.id", ondelete="SET NULL"), nullable=True)
    channel: Mapped[str] = mapped_column(String(50), default="webhook")  # webhook / email
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
