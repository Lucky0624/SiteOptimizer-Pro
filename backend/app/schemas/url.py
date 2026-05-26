from datetime import date, datetime

from pydantic import BaseModel, Field


class URLCreate(BaseModel):
    url: str = Field(..., description="The URL to track")
    title: str | None = Field(None, description="Page title")
    website_id: int | None = Field(None, description="The website ID this URL belongs to")


class URLBatchCreate(BaseModel):
    urls: list[URLCreate] = Field(..., description="List of URLs to create")


class TagResponse(BaseModel):
    id: int
    tag_type: str
    tag_name: str
    auto_applied: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SnapshotResponse(BaseModel):
    id: int
    snapshot_date: date
    clicks: int
    impressions: int
    ctr: float
    position: float
    lcp_value: float | None = None
    cls_value: float | None = None
    fid_value: float | None = None
    performance_score: int | None = None
    bounce_rate: float | None = None
    conversions: int | None = None
    previous_clicks: int | None
    previous_impressions: int | None
    previous_ctr: float | None
    previous_position: float | None

    model_config = {"from_attributes": True}


class URLResponse(BaseModel):
    id: int
    url: str
    title: str | None
    priority_score: float
    status: str
    website_id: int | None
    last_crawled_at: datetime | None
    last_modified_at: datetime | None
    created_at: datetime
    updated_at: datetime | None
    latest_snapshot: SnapshotResponse | None = None

    model_config = {"from_attributes": True}


class URLDetailResponse(URLResponse):
    tags: list[TagResponse] = []
    snapshots: list[SnapshotResponse] = []


class URLListResponse(BaseModel):
    total: int
    items: list[URLResponse]
    page: int
    page_size: int


class URLUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    website_id: int | None = None
