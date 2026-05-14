from datetime import date, datetime

from pydantic import BaseModel, Field


class QuotaResponse(BaseModel):
    id: int
    api_type: str
    usage_date: date
    used_count: int
    limit_count: int

    model_config = {"from_attributes": True}


class QuotaStatusItem(BaseModel):
    api_type: str
    used: int
    limit: int
    remaining: int


class QuotaStatusResponse(BaseModel):
    date: date
    quotas: list[QuotaStatusItem]
