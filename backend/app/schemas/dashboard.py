from datetime import date

from pydantic import BaseModel, Field

from app.schemas.quota import QuotaStatusItem


class DashboardStatsResponse(BaseModel):
    total_urls: int
    indexed_count: int
    opportunity_count: int
    decaying_count: int
    quota_summary: list[QuotaStatusItem]


class TrendDataPoint(BaseModel):
    date: date
    clicks: int
    impressions: int
    ctr: float
    position: float
    conversions: int = 0


class DashboardTrendsResponse(BaseModel):
    period_days: int
    data: list[TrendDataPoint]


class TopOpportunityItem(BaseModel):
    url_id: int
    url: str
    priority_score: float
    impressions: int
    position: float
    ctr: float


class TopOpportunitiesResponse(BaseModel):
    items: list[TopOpportunityItem]


class DecayingURLItem(BaseModel):
    url_id: int
    url: str
    priority_score: float
    clicks: int
    previous_clicks: int | None
    drop_percent: float | None


class DecayingURLsResponse(BaseModel):
    items: list[DecayingURLItem]
