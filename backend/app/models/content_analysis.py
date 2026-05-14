from datetime import datetime, timezone
from sqlalchemy import Float, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

class ContentAnalysis(Base):
    __tablename__ = "contentanalysis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url_id: Mapped[int] = mapped_column(Integer, ForeignKey("urlrecord.id"))
    
    # NLP Scores
    sentiment_score: Mapped[float | None] = mapped_column(Float, nullable=True) # -1.0 to 1.0
    sentiment_magnitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    
    # Structured Data
    entities: Mapped[dict | None] = mapped_column(JSON, nullable=True) # List of extracted entities
    top_categories: Mapped[dict | None] = mapped_column(JSON, nullable=True) # Content categorization
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    url_record: Mapped["URLRecord"] = relationship(back_populates="content_analyses")
