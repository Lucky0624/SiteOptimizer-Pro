from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import verify_admin_key
from app.models.quota import QuotaUsage
from app.schemas.quota import QuotaResponse, QuotaStatusResponse, QuotaStatusItem
from app.services.quota_manager import quota_manager

router = APIRouter(prefix="/api/quota", tags=["Quota"])


@router.get("/status", response_model=QuotaStatusResponse)
async def get_quota_status(
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    statuses = await quota_manager.get_daily_status(db)
    quota_items = [QuotaStatusItem(**v) for v in statuses.values()]
    return QuotaStatusResponse(date=date.today(), quotas=quota_items)


@router.get("/history", response_model=list[QuotaResponse])
async def get_quota_history(
    days: int = Query(30, ge=1, le=90),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    start_date = date.today() - timedelta(days=days)
    stmt = (
        select(QuotaUsage)
        .where(QuotaUsage.usage_date >= start_date)
        .order_by(QuotaUsage.usage_date.desc())
    )
    result = await db.execute(stmt)
    usages = result.scalars().all()
    return [QuotaResponse.model_validate(u) for u in usages]
