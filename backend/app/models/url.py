from datetime import datetime, timezone

from sqlalchemy import Float, Integer, String, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class URLRecord(Base):
    __tablename__ = "urlrecord"
    __table_args__ = (
        # 修复P0：允许不同站点有相同URL，唯一性约束改为 (url, website_id) 联合
        UniqueConstraint("url", "website_id", name="uq_url_website"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url: Mapped[str] = mapped_column(String, index=True)  # 移除全局 unique=True
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    priority_score: Mapped[float] = mapped_column(Float, default=0.0, index=True)
    status: Mapped[str] = mapped_column(String, default="active")
    
    website_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("website.id"), nullable=True)
    website: Mapped["Website"] = relationship(back_populates="urls")
    last_crawled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_modified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, onupdate=lambda: datetime.now(timezone.utc))

    tags: Mapped[list["Tag"]] = relationship(back_populates="url_record", cascade="all, delete-orphan")
    snapshots: Mapped[list["PerformanceSnapshot"]] = relationship(back_populates="url_record", cascade="all, delete-orphan")
    tasks: Mapped[list["TaskQueue"]] = relationship(back_populates="url_record", cascade="all, delete-orphan")
    content_analyses: Mapped[list["ContentAnalysis"]] = relationship(back_populates="url_record", cascade="all, delete-orphan")
    keyword_snapshots: Mapped[list["KeywordSnapshot"]] = relationship(back_populates="url_record", cascade="all, delete-orphan")
    content_optimizations: Mapped[list["ContentOptimizationTask"]] = relationship(back_populates="url_record", cascade="all, delete-orphan")
