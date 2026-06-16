from datetime import datetime
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional


_SITE_TYPES = {"generic", "shopify", "wordpress"}


def _normalize_domain(value: str) -> str:
    raw = value.strip()
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    if parsed.path not in ("", "/") or parsed.params or parsed.query or parsed.fragment:
        raise ValueError("域名只能填写主机名，不能包含路径或参数")
    domain = (parsed.hostname or "").lower().rstrip(".")
    if not domain:
        raise ValueError("请输入有效域名")
    if parsed.port:
        domain = f"{domain}:{parsed.port}"
    return domain


def _optional_trim(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


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
    is_active: bool = False

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("站点名称不能为空")
        return cleaned

    @field_validator("domain")
    @classmethod
    def clean_domain(cls, value: str) -> str:
        return _normalize_domain(value)

    @field_validator("site_type")
    @classmethod
    def validate_site_type(cls, value: str) -> str:
        if value not in _SITE_TYPES:
            raise ValueError("不支持的站点类型")
        return value

    @field_validator(
        "gsc_site_url",
        "shopify_access_token",
        "wp_username",
        "wp_app_password",
        "wp_api_url",
        "ga4_property_id",
        mode="before",
    )
    @classmethod
    def clean_optional_value(cls, value: str | None) -> str | None:
        return _optional_trim(value)


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

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("站点名称不能为空")
        return cleaned

    @field_validator("domain")
    @classmethod
    def clean_domain(cls, value: str | None) -> str | None:
        return _normalize_domain(value) if value is not None else None

    @field_validator("site_type")
    @classmethod
    def validate_site_type(cls, value: str | None) -> str | None:
        if value is not None and value not in _SITE_TYPES:
            raise ValueError("不支持的站点类型")
        return value

    @field_validator(
        "gsc_site_url",
        "shopify_access_token",
        "wp_username",
        "wp_app_password",
        "wp_api_url",
        "ga4_property_id",
        mode="before",
    )
    @classmethod
    def clean_optional_value(cls, value: str | None) -> str | None:
        return _optional_trim(value)


def _mask(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return "****"


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
    gsc_verified_at: Optional[datetime] = None
    cms_verified_at: Optional[datetime] = None
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
