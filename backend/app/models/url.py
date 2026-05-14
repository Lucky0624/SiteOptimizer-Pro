from datetime import datetime, timezone

from sqlalchemy import Float, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class URLRecord(Base):
    __tablename__ = "urlrecord"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url: Mapped[str] = mapped_column(String, unique=True, index=True)
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
