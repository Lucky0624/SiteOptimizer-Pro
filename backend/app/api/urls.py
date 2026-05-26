import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.database import get_db
from app.api.auth import verify_admin_key
from app.models.url import URLRecord
from app.models.snapshot import Tag
from app.schemas.url import (
    URLCreate,
    URLBatchCreate,
    URLResponse,
    URLListResponse,
    URLDetailResponse,
    URLUpdate,
    SnapshotResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/urls", tags=["URLs"])


def _url_response_with_latest(url_record: URLRecord) -> URLResponse:
    response = URLResponse.model_validate(url_record)
    snapshots = list(getattr(url_record, "snapshots", []) or [])
    latest = max(snapshots, key=lambda s: s.snapshot_date, default=None)
    if latest is None:
        return response
    return response.model_copy(
        update={"latest_snapshot": SnapshotResponse.model_validate(latest)}
    )


@router.get("", response_model=URLListResponse)
async def list_urls(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    tag: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    sort_by: str = Query("priority_score"),
    sort_order: str = Query("desc"),
    website_id: int | None = Query(None),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(URLRecord)

    if tag:
        stmt = stmt.join(Tag, Tag.url_id == URLRecord.id).where(Tag.tag_name == tag)
    if status:
        stmt = stmt.where(URLRecord.status == status)
    if search:
        stmt = stmt.where(
            (URLRecord.url.contains(search)) | (URLRecord.title.contains(search))
        )
    if website_id:
        stmt = stmt.where(URLRecord.website_id == website_id)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    sort_col = getattr(URLRecord, sort_by, URLRecord.priority_score)
    if sort_order == "desc":
        stmt = stmt.order_by(sort_col.desc())
    else:
        stmt = stmt.order_by(sort_col.asc())

    offset = (page - 1) * page_size
    stmt = stmt.options(selectinload(URLRecord.snapshots)).offset(offset).limit(page_size)

    result = await db.execute(stmt)
    urls = result.scalars().all()

    return URLListResponse(
        total=total,
        items=[_url_response_with_latest(u) for u in urls],
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=list[URLResponse])
async def create_urls(
    payload: URLBatchCreate | URLCreate,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    if isinstance(payload, URLBatchCreate):
        urls_to_create = payload.urls
    else:
        urls_to_create = [payload]

    created: list[URLRecord] = []
    for url_data in urls_to_create:
        # 修复：按 (url, website_id) 检查唯一性，允许同 URL 属于不同站点
        existing_stmt = select(URLRecord).where(
            URLRecord.url == url_data.url,
            URLRecord.website_id == url_data.website_id,
        )
        existing_result = await db.execute(existing_stmt)
        if existing_result.scalar_one_or_none():
            continue

        url_record = URLRecord(
            url=url_data.url,
            title=url_data.title,
            status="active",
            website_id=url_data.website_id,
        )
        db.add(url_record)
        created.append(url_record)

    await db.flush()

    for url_record in created:
        await db.refresh(url_record)

    return [URLResponse.model_validate(u) for u in created]


class SitemapImportRequest(BaseModel):
    sitemap_url: str
    website_id: int | None = None


class SitemapImportResponse(BaseModel):
    imported: int
    skipped: int
    total_found: int
    sitemap_url: str


@router.post("/import-sitemap", response_model=SitemapImportResponse)
async def import_from_sitemap(
    payload: SitemapImportRequest,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    """从 Sitemap URL 批量导入 URL（支持 sitemap index 和标准 urlset）"""
    from app.services.sitemap_service import fetch_sitemap_urls

    try:
        urls = await fetch_sitemap_urls(payload.sitemap_url, max_urls=5000)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    total_found = len(urls)
    imported = 0
    skipped = 0

    for url_str in urls:
        existing_stmt = select(URLRecord).where(
            URLRecord.url == url_str,
            URLRecord.website_id == payload.website_id,
        )
        existing_result = await db.execute(existing_stmt)
        if existing_result.scalar_one_or_none():
            skipped += 1
            continue

        url_record = URLRecord(
            url=url_str,
            status="active",
            website_id=payload.website_id,
        )
        db.add(url_record)
        imported += 1

    await db.flush()
    logger.info(
        "Sitemap import: %s → imported=%d, skipped=%d, total=%d",
        payload.sitemap_url, imported, skipped, total_found
    )

    return SitemapImportResponse(
        imported=imported,
        skipped=skipped,
        total_found=total_found,
        sitemap_url=payload.sitemap_url,
    )


# ── CSV 导出 ──────────────────────────────────────────────

@router.get("/export")
async def export_urls_csv(
    website_id: int | None = Query(None),
    tag: str | None = Query(None),
    status: str | None = Query(None),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    """导出 URL 列表为 CSV 文件。必须放在 /{url_id} 之前，避免被动态路由吞掉。"""
    import csv
    import io
    from fastapi.responses import StreamingResponse

    stmt = select(URLRecord).options(selectinload(URLRecord.tags))
    if website_id:
        stmt = stmt.where(URLRecord.website_id == website_id)
    if status:
        stmt = stmt.where(URLRecord.status == status)
    if tag:
        stmt = stmt.join(Tag, Tag.url_id == URLRecord.id).where(Tag.tag_name == tag)

    stmt = stmt.order_by(URLRecord.priority_score.desc())
    records = (await db.execute(stmt)).scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "URL", "Title", "Priority Score", "Status", "Tags", "Last Crawled", "Created At"])
    for rec in records:
        tag_names = ",".join(t.tag_name for t in rec.tags)
        writer.writerow([
            rec.id, rec.url, rec.title or "", rec.priority_score, rec.status,
            tag_names,
            rec.last_crawled_at.isoformat() if rec.last_crawled_at else "",
            rec.created_at.isoformat() if rec.created_at else "",
        ])

    output.seek(0)
    filename = f"urls_export_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{url_id}", response_model=URLDetailResponse)
async def get_url(
    url_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(URLRecord)
        .options(selectinload(URLRecord.tags), selectinload(URLRecord.snapshots))
        .where(URLRecord.id == url_id)
    )
    result = await db.execute(stmt)
    url_record = result.scalar_one_or_none()

    if not url_record:
        raise HTTPException(status_code=404, detail="URL not found")

    detail = URLDetailResponse.model_validate(url_record)
    detail.snapshots.sort(key=lambda snap: snap.snapshot_date, reverse=True)
    return detail


@router.put("/{url_id}", response_model=URLResponse)
async def update_url(
    url_id: int,
    payload: URLUpdate,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(URLRecord).where(URLRecord.id == url_id)
    result = await db.execute(stmt)
    url_record = result.scalar_one_or_none()

    if not url_record:
        raise HTTPException(status_code=404, detail="URL not found")

    if payload.title is not None:
        url_record.title = payload.title
    if payload.status is not None:
        url_record.status = payload.status

    await db.flush()
    await db.refresh(url_record)

    return URLResponse.model_validate(url_record)


@router.delete("/{url_id}", response_model=URLResponse)
async def delete_url(
    url_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(URLRecord).where(URLRecord.id == url_id)
    result = await db.execute(stmt)
    url_record = result.scalar_one_or_none()

    if not url_record:
        raise HTTPException(status_code=404, detail="URL not found")

    url_record.status = "archived"
    await db.flush()
    await db.refresh(url_record)

    return URLResponse.model_validate(url_record)


@router.post("/{url_id}/recrawl", response_model=URLResponse)
async def mark_for_recrawl(
    url_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(URLRecord).where(URLRecord.id == url_id)
    result = await db.execute(stmt)
    url_record = result.scalar_one_or_none()

    if not url_record:
        raise HTTPException(status_code=404, detail="URL not found")

    from app.services.tag_engine import tag_engine

    await tag_engine.apply_tag(db, url_record.id, "status", "Need_Recrawl")
    url_record.last_modified_at = datetime.utcnow()
    await db.flush()
    await db.refresh(url_record)

    return URLResponse.model_validate(url_record)


# ── 批量操作 ──────────────────────────────────────────────

class BatchActionRequest(BaseModel):
    action: str  # "archive" | "recrawl" | "delete"
    ids: list[int]


@router.post("/batch")
async def batch_action(
    payload: BatchActionRequest,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    """批量操作：archive(归档) | recrawl(重抓取) | delete(删除)"""
    if not payload.ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    if payload.action not in ("archive", "recrawl", "delete"):
        raise HTTPException(status_code=400, detail=f"Unsupported action: {payload.action}")

    stmt = select(URLRecord).where(URLRecord.id.in_(payload.ids))
    records = (await db.execute(stmt)).scalars().all()

    affected = 0
    for rec in records:
        if payload.action == "archive":
            rec.status = "archived"
            affected += 1
        elif payload.action == "recrawl":
            from app.services.tag_engine import tag_engine
            await tag_engine.apply_tag(db, rec.id, "status", "Need_Recrawl")
            rec.last_modified_at = datetime.now(timezone.utc)
            affected += 1
        elif payload.action == "delete":
            await db.delete(rec)
            affected += 1

    await db.flush()
    logger.info("Batch %s applied to %d URLs", payload.action, affected)
    return {"status": "ok", "action": payload.action, "affected": affected}
