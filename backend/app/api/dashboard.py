from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import verify_admin_key
from app.models.url import URLRecord
from app.models.snapshot import Tag, PerformanceSnapshot
from app.schemas.dashboard import (
    DashboardStatsResponse,
    DashboardTrendsResponse,
    TrendDataPoint,
    TopOpportunitiesResponse,
    TopOpportunityItem,
    DecayingURLsResponse,
    DecayingURLItem,
)
from app.schemas.quota import QuotaStatusItem
from app.services.quota_manager import quota_manager

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    website_id: int | None = Query(None),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    base_url_q = select(URLRecord).where(URLRecord.status == "active")
    if website_id:
        base_url_q = base_url_q.where(URLRecord.website_id == website_id)

    total_urls = (await db.execute(
        select(func.count()).select_from(base_url_q.subquery())
    )).scalar() or 0

    indexed_q = select(URLRecord).join(Tag, Tag.url_id == URLRecord.id).where(Tag.tag_name == "Indexed", URLRecord.status == "active")
    if website_id:
        indexed_q = indexed_q.where(URLRecord.website_id == website_id)
    indexed_count = (await db.execute(
        select(func.count()).select_from(indexed_q.subquery())
    )).scalar() or 0

    opp_q = select(URLRecord).join(Tag, Tag.url_id == URLRecord.id).where(Tag.tag_name == "Opportunity", URLRecord.status == "active")
    if website_id:
        opp_q = opp_q.where(URLRecord.website_id == website_id)
    opportunity_count = (await db.execute(
        select(func.count()).select_from(opp_q.subquery())
    )).scalar() or 0

    decay_q = select(URLRecord).join(Tag, Tag.url_id == URLRecord.id).where(Tag.tag_name == "Decaying", URLRecord.status == "active")
    if website_id:
        decay_q = decay_q.where(URLRecord.website_id == website_id)
    decaying_count = (await db.execute(
        select(func.count()).select_from(decay_q.subquery())
    )).scalar() or 0

    statuses = await quota_manager.get_daily_status(db)
    quota_summary = [QuotaStatusItem(**v) for v in statuses.values()]

    return DashboardStatsResponse(
        total_urls=total_urls,
        indexed_count=indexed_count,
        opportunity_count=opportunity_count,
        decaying_count=decaying_count,
        quota_summary=quota_summary,
    )


@router.get("/trends", response_model=DashboardTrendsResponse)
async def get_performance_trends(
    days: int = Query(30, ge=7, le=90),
    website_id: int | None = Query(None),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    start_date = date.today() - timedelta(days=days)

    stmt = (
        select(
            PerformanceSnapshot.snapshot_date,
            func.sum(PerformanceSnapshot.clicks).label("clicks"),
            func.sum(PerformanceSnapshot.impressions).label("impressions"),
            func.avg(PerformanceSnapshot.ctr).label("ctr"),
            func.avg(PerformanceSnapshot.position).label("position"),
            func.sum(PerformanceSnapshot.conversions).label("conversions"),
        )
        .where(PerformanceSnapshot.snapshot_date >= start_date)
        .group_by(PerformanceSnapshot.snapshot_date)
        .order_by(PerformanceSnapshot.snapshot_date)
    )

    if website_id:
        stmt = stmt.join(URLRecord, URLRecord.id == PerformanceSnapshot.url_id).where(URLRecord.website_id == website_id)

    result = await db.execute(stmt)
    rows = result.all()

    data_points = [
        TrendDataPoint(
            date=row.snapshot_date,
            clicks=row.clicks or 0,
            impressions=row.impressions or 0,
            ctr=round(row.ctr or 0.0, 2),
            position=round(row.position or 0.0, 2),
            conversions=row.conversions or 0,
        )
        for row in rows
    ]

    return DashboardTrendsResponse(period_days=days, data=data_points)


@router.get("/top-opportunities", response_model=TopOpportunitiesResponse)
async def get_top_opportunities(
    limit: int = Query(10, ge=1, le=50),
    website_id: int | None = Query(None),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    latest_snap_subq = (
        select(
            PerformanceSnapshot.url_id,
            PerformanceSnapshot.impressions,
            PerformanceSnapshot.position,
            PerformanceSnapshot.ctr,
            func.row_number()
            .over(partition_by=PerformanceSnapshot.url_id, order_by=PerformanceSnapshot.snapshot_date.desc())
            .label("rn"),
        )
        .subquery()
    )

    stmt = (
        select(URLRecord, latest_snap_subq)
        .join(Tag, Tag.url_id == URLRecord.id)
        .join(latest_snap_subq, latest_snap_subq.c.url_id == URLRecord.id)
        .where(
            Tag.tag_name == "Opportunity",
            URLRecord.status == "active",
            latest_snap_subq.c.rn == 1,
        )
    )

    if website_id:
        stmt = stmt.where(URLRecord.website_id == website_id)

    stmt = stmt.order_by(URLRecord.priority_score.desc()).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()

    items = [
        TopOpportunityItem(
            url_id=url.id,
            url=url.url,
            priority_score=url.priority_score,
            impressions=snap.impressions,
            position=snap.position,
            ctr=snap.ctr,
        )
        for url, snap in rows
    ]

    return TopOpportunitiesResponse(items=items)


@router.get("/decaying", response_model=DecayingURLsResponse)
async def get_decaying_urls(
    limit: int = Query(10, ge=1, le=50),
    website_id: int | None = Query(None),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    latest_snap_subq = (
        select(
            PerformanceSnapshot.url_id,
            PerformanceSnapshot.clicks,
            PerformanceSnapshot.previous_clicks,
            func.row_number()
            .over(partition_by=PerformanceSnapshot.url_id, order_by=PerformanceSnapshot.snapshot_date.desc())
            .label("rn"),
        )
        .subquery()
    )

    stmt = (
        select(URLRecord, latest_snap_subq)
        .join(Tag, Tag.url_id == URLRecord.id)
        .join(latest_snap_subq, latest_snap_subq.c.url_id == URLRecord.id)
        .where(
            Tag.tag_name == "Decaying",
            URLRecord.status == "active",
            latest_snap_subq.c.rn == 1,
        )
    )

    if website_id:
        stmt = stmt.where(URLRecord.website_id == website_id)

    stmt = stmt.order_by(URLRecord.priority_score.desc()).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for url, snap in rows:
        drop_pct = None
        if snap.previous_clicks and snap.previous_clicks > 0:
            drop_pct = round(
                (snap.previous_clicks - snap.clicks) / snap.previous_clicks * 100, 2
            )
        items.append(
            DecayingURLItem(
                url_id=url.id,
                url=url.url,
                priority_score=url.priority_score,
                clicks=snap.clicks,
                previous_clicks=snap.previous_clicks,
                drop_percent=drop_pct,
            )
        )

    return DecayingURLsResponse(items=items)


@router.post("/run-cycle")
async def run_manual_cycle(
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    from app.services.seo_loop import seo_loop
    result = await seo_loop.run_full_cycle(db)
    return {"status": "success", "result": result}
