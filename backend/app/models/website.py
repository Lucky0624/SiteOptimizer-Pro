from datetime import datetime, timezone
from sqlalchemy import Boolean, Integer, String, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

class Website(Base):
    __tablename__ = "website"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    domain: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    site_type: Mapped[str] = mapped_column(String(20), default="generic") # shopify, wordpress, generic
    
    # GSC Configuration
    gsc_site_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Shopify Configuration
    shopify_access_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # WordPress Configuration
    wp_username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    wp_app_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    wp_api_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # GA4 Configuration
    ga4_property_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Connection verification state
    gsc_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cms_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, onupdate=lambda: datetime.now(timezone.utc))

    urls: Mapped[list["URLRecord"]] = relationship(back_populates="website", cascade="all, delete-orphan")
