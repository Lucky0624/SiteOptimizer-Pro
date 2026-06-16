from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ContentOptimizationTask(Base):
    __tablename__ = "contentoptimizationtask"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    website_id: Mapped[int] = mapped_column(Integer, ForeignKey("website.id", ondelete="CASCADE"), index=True)
    url_id: Mapped[int] = mapped_column(Integer, ForeignKey("urlrecord.id", ondelete="CASCADE"), index=True)

    platform: Mapped[str] = mapped_column(String(30))
    resource_type: Mapped[str] = mapped_column(String(50))
    resource_id: Mapped[str] = mapped_column(String(100))
    resource_parent_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resource_url: Mapped[str] = mapped_column(String)

    current_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_meta_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_content_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)

    suggested_title: Mapped[str] = mapped_column(Text)
    suggested_meta_description: Mapped[str] = mapped_column(Text)
    suggested_content_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)

    primary_keyword: Mapped[str | None] = mapped_column(String(255), nullable=True)
    supporting_keywords: Mapped[list | None] = mapped_column(JSON, nullable=True)
    missing_keywords: Mapped[list | None] = mapped_column(JSON, nullable=True)
    content_gap_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(30), default="draft", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    url_record: Mapped["URLRecord"] = relationship(back_populates="content_optimizations")
