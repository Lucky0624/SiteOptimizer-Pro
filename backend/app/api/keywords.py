"""
GSC 关键词维度分析接口
GET /api/keywords  — 查询已存储的关键词快照数据
POST /api/keywords/fetch  — 手动触发指定 URL 的关键词数据抓取
"""
import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.api.auth import verify_admin_key
from app.models.keyword import KeywordSnapshot
from app.models.url import URLRecord
from app.models.website import Website

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/keywords", tags=["Keywords"])


class KeywordItem(BaseModel):
    keyword: str
    clicks: int
    impressions: int
    ctr: float
    position: float
    snapshot_date: date


class KeywordListResponse(BaseModel):
    url_id: int | None
    url: str | None
    items: list[KeywordItem]
    total: int


class KeywordCollectRequest(BaseModel):
    website_id: int
    days: int = 30
    limit: int = 20


class KeywordTrendPoint(BaseModel):
    date: date
    clicks: int
    impressions: int
    ctr: float
    position: float


class KeywordPageMapItem(BaseModel):
    url_id: int
    url: str
    title: str | None
    keyword_count: int
    clicks: int
    impressions: int
    avg_position: float
    top_keywords: list[KeywordItem]


class KeywordClusterItem(BaseModel):
    cluster: str
    keyword_count: int
    clicks: int
    impressions: int
    avg_position: float
    keywords: list[str]


def _weighted_ctr():
    impressions = func.sum(KeywordSnapshot.impressions)
    return case(
        (impressions > 0, func.sum(KeywordSnapshot.clicks) * 1.0 / impressions),
        else_=0.0,
    )


def _weighted_position():
    impressions = func.sum(KeywordSnapshot.impressions)
    return case(
        (
            impressions > 0,
            func.sum(KeywordSnapshot.position * KeywordSnapshot.impressions) / impressions,
        ),
        else_=func.avg(KeywordSnapshot.position),
    )


async def _store_keyword_rows(
    db: AsyncSession,
    url_id: int,
    rows: list[dict],
    default_snapshot_date: date | None = None,
) -> int:
    imported = 0
    for row in rows:
        keys = row.get("keys", [])
        if len(keys) >= 3:
            try:
                snap_date = date.fromisoformat(keys[0])
            except ValueError:
                continue
            keyword = keys[2]
        elif len(keys) >= 2 and default_snapshot_date:
            snap_date = default_snapshot_date
            keyword = keys[1]
        else:
            continue

        existing = (await db.execute(
            select(KeywordSnapshot).where(
                KeywordSnapshot.url_id == url_id,
                KeywordSnapshot.keyword == keyword,
                KeywordSnapshot.snapshot_date == snap_date,
            )
        )).scalar_one_or_none()

        if existing:
            existing.clicks = row.get("clicks", 0)
            existing.impressions = row.get("impressions", 0)
            existing.ctr = round(row.get("ctr", 0.0), 4)
            existing.position = round(row.get("position", 0.0), 2)
        else:
            db.add(KeywordSnapshot(
                url_id=url_id,
                keyword=keyword,
                snapshot_date=snap_date,
                clicks=row.get("clicks", 0),
                impressions=row.get("impressions", 0),
                ctr=round(row.get("ctr", 0.0), 4),
                position=round(row.get("position", 0.0), 2),
            ))
            imported += 1
    return imported


def _cluster_key(keyword: str) -> str:
    cleaned = keyword.lower().strip()
    for ch in ",.;:!?()[]{}|/-_":
        cleaned = cleaned.replace(ch, " ")
    words = [w for w in cleaned.split() if len(w) > 1 and w not in {"the", "and", "for", "with", "near", "best"}]
    if words:
        return " ".join(words[:2])
    return cleaned[:8] or "other"


@router.get("", response_model=KeywordListResponse)
async def list_keywords(
    website_id: int | None = Query(None),
    url_id: int | None = Query(None),
    days: int = Query(30, ge=7, le=90),
    search: str | None = Query(None),
    sort_by: str = Query("clicks"),  # clicks | impressions | position | ctr
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    start_date = date.today() - timedelta(days=days)

    stmt = (
        select(
            KeywordSnapshot.keyword,
            func.sum(KeywordSnapshot.clicks).label("clicks"),
            func.sum(KeywordSnapshot.impressions).label("impressions"),
            _weighted_ctr().label("ctr"),
            _weighted_position().label("position"),
            func.max(KeywordSnapshot.snapshot_date).label("snapshot_date"),
        )
        .join(URLRecord, URLRecord.id == KeywordSnapshot.url_id)
        .where(KeywordSnapshot.snapshot_date >= start_date)
        .group_by(KeywordSnapshot.keyword)
    )

    if url_id:
        stmt = stmt.where(KeywordSnapshot.url_id == url_id)
    elif website_id:
        stmt = stmt.where(URLRecord.website_id == website_id)

    if search:
        stmt = stmt.where(KeywordSnapshot.keyword.ilike(f"%{search}%"))

    # 排序
    sort_col_map = {
        "clicks": func.sum(KeywordSnapshot.clicks).label("clicks"),
        "impressions": func.sum(KeywordSnapshot.impressions).label("impressions"),
        "position": _weighted_position(),
        "ctr": _weighted_ctr(),
    }
    sort_col = sort_col_map.get(sort_by, func.sum(KeywordSnapshot.clicks).label("clicks"))
    if sort_by == "position":
        stmt = stmt.order_by(sort_col.asc())  # 排名越小越好
    else:
        stmt = stmt.order_by(sort_col.desc())

    # 总数
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).all()

    items = [
        KeywordItem(
            keyword=row.keyword,
            clicks=row.clicks or 0,
            impressions=row.impressions or 0,
            ctr=round(row.ctr or 0.0, 4),
            position=round(row.position or 0.0, 2),
            snapshot_date=row.snapshot_date,
        )
        for row in rows
    ]

    # 获取 URL 信息
    url_str = None
    if url_id:
        url_rec = await db.get(URLRecord, url_id)
        if url_rec:
            url_str = url_rec.url

    return KeywordListResponse(url_id=url_id, url=url_str, items=items, total=total)


@router.post("/fetch")
async def fetch_keywords_for_url(
    url_id: int = Query(...),
    days: int = Query(30, ge=7, le=90),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    """手动触发指定 URL 的关键词数据抓取（调用 GSC page+query 维度）"""
    url_rec = await db.get(URLRecord, url_id)
    if not url_rec:
        raise HTTPException(status_code=404, detail="URL not found")
    if not url_rec.website_id:
        raise HTTPException(status_code=400, detail="URL has no associated website")

    website = await db.get(Website, url_rec.website_id)
    if not website or not website.gsc_site_url:
        raise HTTPException(status_code=400, detail="Website has no GSC URL configured")

    end = date.today() - timedelta(days=2)
    start = end - timedelta(days=days - 1)

    from app.services.google_api import google_api_client
    rows = await google_api_client.get_gsc_keyword_data(
        site_url=website.gsc_site_url,
        page_url=url_rec.url,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        website_id=website.id,
    )

    imported = await _store_keyword_rows(db, url_id, rows)

    await db.flush()
    return {"status": "ok", "keywords_found": len(rows), "imported": imported}


@router.post("/collect")
async def collect_keywords_for_website(
    payload: KeywordCollectRequest,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    """批量采集某站点优先级最高 URL 的页面-关键词数据。"""
    website = await db.get(Website, payload.website_id)
    if not website or not website.gsc_site_url:
        raise HTTPException(status_code=400, detail="Website has no GSC URL configured")

    safe_limit = max(1, min(payload.limit, 100))
    safe_days = max(7, min(payload.days, 90))

    url_stmt = (
        select(URLRecord)
        .where(URLRecord.website_id == website.id, URLRecord.status == "active")
        .order_by(URLRecord.priority_score.desc())
        .limit(safe_limit)
    )
    urls = list((await db.execute(url_stmt)).scalars().all())

    from app.services.google_api import google_api_client
    from app.services.quota_manager import quota_manager

    end = date.today() - timedelta(days=2)
    start = end - timedelta(days=safe_days - 1)
    imported = 0
    fetched = 0
    skipped_quota = 0
    errors: list[dict] = []

    for url_rec in urls:
        if not await quota_manager.consume_quota(db, "gsc"):
            skipped_quota += 1
            break
        try:
            rows = await google_api_client.get_gsc_keyword_data(
                site_url=website.gsc_site_url,
                page_url=url_rec.url,
                start_date=start.isoformat(),
                end_date=end.isoformat(),
                website_id=website.id,
            )
            fetched += 1
            imported += await _store_keyword_rows(db, url_rec.id, rows)
        except Exception as e:
            logger.warning("Keyword collect failed for URL %s: %s", url_rec.url, e)
            errors.append({"url_id": url_rec.id, "error": str(e)})

    await db.flush()
    return {
        "status": "ok",
        "urls_scanned": fetched,
        "keywords_imported": imported,
        "skipped_quota": skipped_quota,
        "errors": errors[:10],
    }


@router.get("/trends", response_model=list[KeywordTrendPoint])
async def keyword_trends(
    website_id: int | None = Query(None),
    url_id: int | None = Query(None),
    keyword: str | None = Query(None),
    days: int = Query(90, ge=7, le=180),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    start_date = date.today() - timedelta(days=days)
    stmt = (
        select(
            KeywordSnapshot.snapshot_date,
            func.sum(KeywordSnapshot.clicks).label("clicks"),
            func.sum(KeywordSnapshot.impressions).label("impressions"),
            _weighted_ctr().label("ctr"),
            _weighted_position().label("position"),
        )
        .join(URLRecord, URLRecord.id == KeywordSnapshot.url_id)
        .where(KeywordSnapshot.snapshot_date >= start_date)
        .group_by(KeywordSnapshot.snapshot_date)
        .order_by(KeywordSnapshot.snapshot_date)
    )
    if url_id:
        stmt = stmt.where(KeywordSnapshot.url_id == url_id)
    elif website_id:
        stmt = stmt.where(URLRecord.website_id == website_id)
    if keyword:
        stmt = stmt.where(KeywordSnapshot.keyword == keyword)

    rows = (await db.execute(stmt)).all()
    return [
        KeywordTrendPoint(
            date=row.snapshot_date,
            clicks=row.clicks or 0,
            impressions=row.impressions or 0,
            ctr=round(row.ctr or 0.0, 4),
            position=round(row.position or 0.0, 2),
        )
        for row in rows
    ]


@router.get("/page-map", response_model=list[KeywordPageMapItem])
async def keyword_page_map(
    website_id: int | None = Query(None),
    days: int = Query(90, ge=7, le=180),
    limit: int = Query(50, ge=1, le=200),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    start_date = date.today() - timedelta(days=days)
    stmt = (
        select(
            URLRecord.id.label("url_id"),
            URLRecord.url,
            URLRecord.title,
            KeywordSnapshot.keyword,
            func.sum(KeywordSnapshot.clicks).label("clicks"),
            func.sum(KeywordSnapshot.impressions).label("impressions"),
            _weighted_ctr().label("ctr"),
            _weighted_position().label("position"),
            func.max(KeywordSnapshot.snapshot_date).label("snapshot_date"),
        )
        .join(URLRecord, URLRecord.id == KeywordSnapshot.url_id)
        .where(KeywordSnapshot.snapshot_date >= start_date)
        .group_by(URLRecord.id, KeywordSnapshot.keyword)
        .order_by(func.sum(KeywordSnapshot.impressions).desc())
    )
    if website_id:
        stmt = stmt.where(URLRecord.website_id == website_id)

    rows = (await db.execute(stmt)).all()
    grouped: dict[int, dict] = {}
    for row in rows:
        entry = grouped.setdefault(row.url_id, {
            "url_id": row.url_id,
            "url": row.url,
            "title": row.title,
            "keywords": [],
            "clicks": 0,
            "impressions": 0,
            "weighted_position_total": 0.0,
        })
        entry["clicks"] += row.clicks or 0
        entry["impressions"] += row.impressions or 0
        entry["weighted_position_total"] += (row.position or 0.0) * (row.impressions or 0)
        entry["keywords"].append(KeywordItem(
            keyword=row.keyword,
            clicks=row.clicks or 0,
            impressions=row.impressions or 0,
            ctr=round(row.ctr or 0.0, 4),
            position=round(row.position or 0.0, 2),
            snapshot_date=row.snapshot_date,
        ))

    items = []
    for entry in grouped.values():
        items.append(KeywordPageMapItem(
            url_id=entry["url_id"],
            url=entry["url"],
            title=entry["title"],
            keyword_count=len(entry["keywords"]),
            clicks=entry["clicks"],
            impressions=entry["impressions"],
            avg_position=round(entry["weighted_position_total"] / entry["impressions"], 2) if entry["impressions"] else 0.0,
            top_keywords=entry["keywords"][:8],
        ))

    items.sort(key=lambda item: item.impressions, reverse=True)
    return items[:limit]


@router.get("/clusters", response_model=list[KeywordClusterItem])
async def keyword_clusters(
    website_id: int | None = Query(None),
    days: int = Query(90, ge=7, le=180),
    limit: int = Query(30, ge=1, le=100),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    start_date = date.today() - timedelta(days=days)
    stmt = (
        select(
            KeywordSnapshot.keyword,
            func.sum(KeywordSnapshot.clicks).label("clicks"),
            func.sum(KeywordSnapshot.impressions).label("impressions"),
            _weighted_position().label("position"),
        )
        .join(URLRecord, URLRecord.id == KeywordSnapshot.url_id)
        .where(KeywordSnapshot.snapshot_date >= start_date)
        .group_by(KeywordSnapshot.keyword)
        .order_by(func.sum(KeywordSnapshot.impressions).desc())
        .limit(500)
    )
    if website_id:
        stmt = stmt.where(URLRecord.website_id == website_id)

    rows = (await db.execute(stmt)).all()
    clusters: dict[str, dict] = {}
    for row in rows:
        key = _cluster_key(row.keyword)
        item = clusters.setdefault(key, {
            "keywords": [],
            "clicks": 0,
            "impressions": 0,
            "weighted_position_total": 0.0,
        })
        item["keywords"].append(row.keyword)
        item["clicks"] += row.clicks or 0
        item["impressions"] += row.impressions or 0
        item["weighted_position_total"] += (row.position or 0.0) * (row.impressions or 0)

    result = []
    for key, item in clusters.items():
        result.append(KeywordClusterItem(
            cluster=key,
            keyword_count=len(item["keywords"]),
            clicks=item["clicks"],
            impressions=item["impressions"],
            avg_position=round(item["weighted_position_total"] / item["impressions"], 2) if item["impressions"] else 0.0,
            keywords=item["keywords"][:12],
        ))
    result.sort(key=lambda item: item.impressions, reverse=True)
    return result[:limit]
