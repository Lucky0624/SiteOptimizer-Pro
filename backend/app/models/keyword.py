from datetime import datetime, timezone
from sqlalchemy import Integer, String, Float, Date, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class KeywordSnapshot(Base):
    """GSC 关键词维度快照：记录每个页面的每个关键词的排名数据"""
    __tablename__ = "keywordsnapshot"
    __table_args__ = (
        UniqueConstraint("url_id", "keyword", "snapshot_date", name="uq_keyword_url_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url_id: Mapped[int] = mapped_column(Integer, ForeignKey("urlrecord.id", ondelete="CASCADE"))
    keyword: Mapped[str] = mapped_column(String(500), index=True)
    snapshot_date: Mapped[object] = mapped_column(Date, index=True)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    ctr: Mapped[float] = mapped_column(Float, default=0.0)
    position: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    url_record: Mapped["URLRecord"] = relationship(back_populates="keyword_snapshots")
