from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
)

router = APIRouter(prefix="/api/urls", tags=["URLs"])


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
    stmt = stmt.offset(offset).limit(page_size)

    result = await db.execute(stmt)
    urls = result.scalars().all()

    return URLListResponse(
        total=total,
        items=[URLResponse.model_validate(u) for u in urls],
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
        existing_stmt = select(URLRecord).where(URLRecord.url == url_data.url)
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

    return URLDetailResponse.model_validate(url_record)


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
    url_record.last_modified_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(url_record)

    return URLResponse.model_validate(url_record)
