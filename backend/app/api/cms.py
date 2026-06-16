"""
CMS 同步控制接口
POST /api/cms/{website_id}/sync  — 手动触发 URL 同步
GET  /api/cms/{website_id}/status — 查询同步状态
POST /api/cms/{website_id}/test   — 测试 CMS 连通性
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import verify_admin_key
from app.models.website import Website
from app.models.url import URLRecord
from app.models.content_optimization import ContentOptimizationTask
from app.services.content_optimizer import content_optimizer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cms", tags=["CMS"])


class CMSContentResponse(BaseModel):
    platform: str
    resource_type: str
    resource_id: str
    resource_parent_id: str | None = None
    url: str
    title: str
    admin_title: str | None = None
    meta_description: str | None = None
    content_text: str | None = None


class CreateOptimizationRequest(BaseModel):
    url_id: int


class UpdateOptimizationRequest(BaseModel):
    suggested_title: str
    suggested_meta_description: str


class ContentOptimizationResponse(BaseModel):
    id: int
    website_id: int
    url_id: int
    platform: str
    resource_type: str
    resource_id: str
    resource_parent_id: str | None
    resource_url: str
    current_title: str | None
    current_meta_description: str | None
    current_content_excerpt: str | None
    suggested_title: str
    suggested_meta_description: str
    suggested_content_excerpt: str | None
    primary_keyword: str | None
    supporting_keywords: list | None
    missing_keywords: list | None
    content_gap_summary: str | None
    status: str
    error_message: str | None
    created_at: datetime
    updated_at: datetime | None
    approved_at: datetime | None
    applied_at: datetime | None

    model_config = {"from_attributes": True}


async def _get_website_and_url(db: AsyncSession, website_id: int, url_id: int) -> tuple[Website, URLRecord]:
    website = await db.get(Website, website_id)
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")

    url_record = await db.get(URLRecord, url_id)
    if not url_record:
        raise HTTPException(status_code=404, detail="URL not found")
    if url_record.website_id != website.id:
        raise HTTPException(status_code=400, detail="URL does not belong to this website")

    return website, url_record


def _get_cms_service(website: Website):
    if website.site_type == "shopify":
        from app.services.shopify_service import shopify_service
        return shopify_service
    if website.site_type == "wordpress":
        from app.services.wordpress_service import wordpress_service
        return wordpress_service
    raise HTTPException(status_code=400, detail=f"CMS integration not supported for site type: {website.site_type}")


def _require_cms_configuration(website: Website) -> None:
    if website.site_type == "shopify" and not website.shopify_access_token:
        raise HTTPException(status_code=400, detail="请先配置 Shopify 访问令牌")
    if website.site_type == "wordpress" and not (
        website.wp_api_url and website.wp_username and website.wp_app_password
    ):
        raise HTTPException(status_code=400, detail="请先完整配置 WordPress API 地址、用户名和应用程序密码")


async def _load_cms_content(website: Website, url_record: URLRecord) -> dict:
    _require_cms_configuration(website)
    service = _get_cms_service(website)
    content = await service.get_content_for_url(website, url_record.url)
    if not content:
        raise HTTPException(status_code=404, detail="CMS content not found for this URL")
    return content


async def _write_urls_to_db(db: AsyncSession, website: Website, url_list: list[str]) -> dict:
    """将 CMS 同步回来的 URL 写入数据库，返回统计"""
    imported = 0
    skipped = 0
    for url_str in url_list:
        stmt = select(URLRecord).where(
            URLRecord.url == url_str,
            URLRecord.website_id == website.id,
        )
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing:
            skipped += 1
            continue
        db.add(URLRecord(url=url_str, status="active", website_id=website.id))
        imported += 1

    await db.flush()
    return {"imported": imported, "skipped": skipped, "total_found": len(url_list)}


@router.get("/{website_id}/content", response_model=CMSContentResponse)
async def get_cms_content(
    website_id: int,
    url_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    """读取 CMS 中当前 URL 对应的标题、描述和正文摘要。"""
    website, url_record = await _get_website_and_url(db, website_id, url_id)
    content = await _load_cms_content(website, url_record)
    return CMSContentResponse(
        platform=content["platform"],
        resource_type=content["resource_type"],
        resource_id=content["resource_id"],
        resource_parent_id=content.get("resource_parent_id"),
        url=content["url"],
        title=content.get("title") or "",
        admin_title=content.get("admin_title"),
        meta_description=content.get("meta_description"),
        content_text=(content.get("content_text") or "")[:2000],
    )


@router.post("/{website_id}/optimizations", response_model=ContentOptimizationResponse)
async def create_content_optimization(
    website_id: int,
    payload: CreateOptimizationRequest,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    """基于页面当前内容和已采集关键词，生成一条待审批的标题/描述优化建议。"""
    website, url_record = await _get_website_and_url(db, website_id, payload.url_id)
    content = await _load_cms_content(website, url_record)
    suggestion = await content_optimizer.build_suggestion(db, url_record, content)

    task = ContentOptimizationTask(
        website_id=website.id,
        url_id=url_record.id,
        platform=content["platform"],
        resource_type=content["resource_type"],
        resource_id=content["resource_id"],
        resource_parent_id=content.get("resource_parent_id"),
        resource_url=content["url"],
        current_title=content.get("title"),
        current_meta_description=content.get("meta_description"),
        current_content_excerpt=(content.get("content_text") or "")[:1000],
        suggested_title=suggestion["suggested_title"],
        suggested_meta_description=suggestion["suggested_meta_description"],
        suggested_content_excerpt=suggestion["suggested_content_excerpt"],
        primary_keyword=suggestion["primary_keyword"],
        supporting_keywords=suggestion["supporting_keywords"],
        missing_keywords=suggestion["missing_keywords"],
        content_gap_summary=suggestion["content_gap_summary"],
        status="draft",
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return task


@router.get("/{website_id}/optimizations", response_model=list[ContentOptimizationResponse])
async def list_content_optimizations(
    website_id: int,
    status: str | None = None,
    url_id: int | None = None,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    website = await db.get(Website, website_id)
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")

    stmt = select(ContentOptimizationTask).where(ContentOptimizationTask.website_id == website_id)
    if status:
        stmt = stmt.where(ContentOptimizationTask.status == status)
    if url_id:
        stmt = stmt.where(ContentOptimizationTask.url_id == url_id)
    stmt = stmt.order_by(ContentOptimizationTask.created_at.desc()).limit(50)
    return list((await db.execute(stmt)).scalars().all())


@router.put("/{website_id}/optimizations/{optimization_id}", response_model=ContentOptimizationResponse)
async def update_content_optimization(
    website_id: int,
    optimization_id: int,
    payload: UpdateOptimizationRequest,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ContentOptimizationTask, optimization_id)
    if not task or task.website_id != website_id:
        raise HTTPException(status_code=404, detail="Optimization not found")
    if task.status not in ("draft", "rejected", "failed"):
        raise HTTPException(status_code=400, detail=f"Cannot edit task in status: {task.status}")

    title = payload.suggested_title.strip()
    description = payload.suggested_meta_description.strip()
    if not title or len(title) > 70:
        raise HTTPException(status_code=400, detail="Suggested title must be 1-70 characters")
    if not description or len(description) > 180:
        raise HTTPException(status_code=400, detail="Suggested meta description must be 1-180 characters")

    task.suggested_title = title
    task.suggested_meta_description = description
    task.status = "draft"
    task.approved_at = None
    task.error_message = None
    await db.flush()
    await db.refresh(task)
    return task


@router.post("/{website_id}/optimizations/{optimization_id}/approve", response_model=ContentOptimizationResponse)
async def approve_content_optimization(
    website_id: int,
    optimization_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ContentOptimizationTask, optimization_id)
    if not task or task.website_id != website_id:
        raise HTTPException(status_code=404, detail="Optimization not found")
    if task.status != "draft":
        raise HTTPException(status_code=400, detail=f"Cannot approve task in status: {task.status}")
    task.status = "approved"
    task.approved_at = datetime.now(timezone.utc)
    task.error_message = None
    await db.flush()
    await db.refresh(task)
    return task


@router.post("/{website_id}/optimizations/{optimization_id}/reject", response_model=ContentOptimizationResponse)
async def reject_content_optimization(
    website_id: int,
    optimization_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ContentOptimizationTask, optimization_id)
    if not task or task.website_id != website_id:
        raise HTTPException(status_code=404, detail="Optimization not found")
    if task.status not in ("draft", "approved"):
        raise HTTPException(status_code=400, detail=f"Cannot reject task in status: {task.status}")
    task.status = "rejected"
    task.error_message = None
    await db.flush()
    await db.refresh(task)
    return task


@router.post("/{website_id}/optimizations/{optimization_id}/apply", response_model=ContentOptimizationResponse)
async def apply_content_optimization(
    website_id: int,
    optimization_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ContentOptimizationTask, optimization_id)
    if not task or task.website_id != website_id:
        raise HTTPException(status_code=404, detail="Optimization not found")

    if task.status != "approved":
        raise HTTPException(status_code=400, detail="Optimization must be approved before applying")

    website = await db.get(Website, website_id)
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")

    service = _get_cms_service(website)
    result = await service.update_content(
        website,
        task.resource_type,
        task.resource_id,
        {
            "title": task.suggested_title,
            "meta_description": task.suggested_meta_description,
        },
        resource_parent_id=task.resource_parent_id,
    )

    if result.get("ok"):
        task.status = "applied"
        task.applied_at = datetime.now(timezone.utc)
        task.error_message = None

        url_record = await db.get(URLRecord, task.url_id)
        if url_record:
            url_record.title = task.suggested_title
            url_record.last_modified_at = datetime.now(timezone.utc)
    else:
        task.status = "failed"
        task.error_message = result.get("error", "CMS update failed")

    await db.flush()
    await db.refresh(task)
    return task


@router.post("/{website_id}/sync")
async def sync_cms_urls(
    website_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    """手动触发单站点的 CMS URL 同步"""
    website = await db.get(Website, website_id)
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")

    site_type = website.site_type
    _require_cms_configuration(website)

    if site_type == "shopify":
        from app.services.shopify_service import shopify_service
        urls = await shopify_service.sync_urls(website)
    elif site_type == "wordpress":
        from app.services.wordpress_service import wordpress_service
        urls = await wordpress_service.sync_urls(website)
    else:
        raise HTTPException(status_code=400, detail=f"CMS sync not supported for site type: {site_type}")

    stats = await _write_urls_to_db(db, website, urls)
    logger.info("CMS sync for website %d (%s): %s", website_id, site_type, stats)
    return {"status": "ok", "site_type": site_type, **stats}


@router.get("/{website_id}/status")
async def get_cms_status(
    website_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    """获取站点的 URL 数量与最后抓取时间"""
    website = await db.get(Website, website_id)
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")

    count_stmt = select(func.count()).where(
        URLRecord.website_id == website_id,
        URLRecord.status == "active",
    )
    total = (await db.execute(count_stmt)).scalar() or 0

    last_stmt = (
        select(URLRecord.created_at)
        .where(URLRecord.website_id == website_id)
        .order_by(URLRecord.created_at.desc())
        .limit(1)
    )
    last_added = (await db.execute(last_stmt)).scalar_one_or_none()

    return {
        "website_id": website_id,
        "site_type": website.site_type,
        "total_urls": total,
        "last_url_added_at": last_added.isoformat() if last_added else None,
    }


@router.post("/{website_id}/test")
async def test_cms_connection(
    website_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    """测试 CMS API 连通性"""
    website = await db.get(Website, website_id)
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")

    site_type = website.site_type

    if site_type == "shopify":
        from app.services.shopify_service import shopify_service
        result = await shopify_service.test_connection(website.domain, website.shopify_access_token or "")
    elif site_type == "wordpress":
        from app.services.wordpress_service import wordpress_service
        result = await wordpress_service.test_connection(
            website.wp_api_url or "", website.wp_username or "", website.wp_app_password or ""
        )
    else:
        return {"ok": False, "error": f"No CMS integration for site type: {site_type}"}

    if result.get("ok"):
        website.cms_verified_at = datetime.now(timezone.utc)
        await db.flush()
        result["verified_at"] = website.cms_verified_at.isoformat()

    return result
