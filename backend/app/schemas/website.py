from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional


class WebsiteBase(BaseModel):
    name: str
    domain: str
    site_type: str = "generic"
    gsc_site_url: Optional[str] = None
    shopify_access_token: Optional[str] = None
    wp_username: Optional[str] = None
    wp_app_password: Optional[str] = None
    wp_api_url: Optional[str] = None
    ga4_property_id: Optional[str] = None
    is_active: bool = True


class WebsiteCreate(WebsiteBase):
    pass


class WebsiteUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    site_type: Optional[str] = None
    gsc_site_url: Optional[str] = None
    shopify_access_token: Optional[str] = None
    wp_username: Optional[str] = None
    wp_app_password: Optional[str] = None
    wp_api_url: Optional[str] = None
    ga4_property_id: Optional[str] = None
    is_active: Optional[bool] = None


def _mask(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if len(value) <= 4:
        return "****"
    return value[:2] + "****" + value[-2:]


class WebsiteResponse(BaseModel):
    id: int
    name: str
    domain: str
    site_type: str
    gsc_site_url: Optional[str] = None
    shopify_access_token: Optional[str] = None
    wp_username: Optional[str] = None
    wp_app_password: Optional[str] = None
    wp_api_url: Optional[str] = None
    ga4_property_id: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    @field_validator("shopify_access_token", "wp_app_password", mode="before")
    @classmethod
    def mask_sensitive(cls, v: Optional[str]) -> Optional[str]:
        return _mask(v)

    model_config = ConfigDict(from_attributes=True)


class WebsiteListResponse(BaseModel):
    items: list[WebsiteResponse]
    total: int
