from datetime import datetime, timezone

from sqlalchemy import Boolean, Date, Float, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Tag(Base):
    __tablename__ = "tag"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url_id: Mapped[int] = mapped_column(Integer, ForeignKey("urlrecord.id"))
    tag_type: Mapped[str] = mapped_column(String)
    tag_name: Mapped[str] = mapped_column(String)
    auto_applied: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    url_record: Mapped["URLRecord"] = relationship(back_populates="tags")


class PerformanceSnapshot(Base):
    __tablename__ = "performancesnapshot"
    __table_args__ = (
        UniqueConstraint("url_id", "snapshot_date", name="uq_snapshot_url_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url_id: Mapped[int] = mapped_column(Integer, ForeignKey("urlrecord.id"))
    snapshot_date: Mapped[Date] = mapped_column(Date, index=True)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    ctr: Mapped[float] = mapped_column(Float, default=0.0)
    position: Mapped[float] = mapped_column(Float, default=0.0)
    
    # PageSpeed Insights & Core Web Vitals
    lcp_value: Mapped[float | None] = mapped_column(Float, nullable=True)  # Largest Contentful Paint
    cls_value: Mapped[float | None] = mapped_column(Float, nullable=True)  # Cumulative Layout Shift
    fid_value: Mapped[float | None] = mapped_column(Float, nullable=True)  # First Input Delay (or TBT)
    performance_score: Mapped[int | None] = mapped_column(Integer, nullable=True) # Lighthouse 0-100
    
    # GA4 Metrics (Reserved for Phase 3)
    bounce_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    conversions: Mapped[int | None] = mapped_column(Integer, nullable=True)

    previous_clicks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    previous_impressions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    previous_ctr: Mapped[float | None] = mapped_column(Float, nullable=True)
    previous_position: Mapped[float | None] = mapped_column(Float, nullable=True)

    url_record: Mapped["URLRecord"] = relationship(back_populates="snapshots")
