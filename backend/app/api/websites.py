import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import verify_admin_key
from app.models.content_optimization import ContentOptimizationTask
from app.models.website import Website
from app.schemas.website import WebsiteCreate, WebsiteUpdate, WebsiteResponse, WebsiteListResponse
from app.services.google_api import google_api_client
from app.services.secret_storage import PROTECTED_WEBSITE_FIELDS, SecretStorageError, protect_secret

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/websites", tags=["Websites"])

_SENSITIVE_FIELDS = PROTECTED_WEBSITE_FIELDS


def _is_masked_secret(value: object) -> bool:
    return isinstance(value, str) and "****" in value


def _protect_website_secrets(data: dict) -> dict:
    protected = data.copy()
    for key in _SENSITIVE_FIELDS:
        value = protected.get(key)
        if value and not _is_masked_secret(value):
            protected[key] = protect_secret(value)
    return protected


@router.get("", response_model=WebsiteListResponse)
async def list_websites(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    site_type: str | None = Query(None),
    search: str | None = Query(None),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Website)
    if site_type:
        stmt = stmt.where(Website.site_type == site_type)
    if search:
        stmt = stmt.where(
            Website.name.ilike(f"%{search.strip()}%") | Website.domain.ilike(f"%{search.strip()}%")
        )
    
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    
    stmt = stmt.order_by(Website.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    
    return WebsiteListResponse(items=list(items), total=total)

@router.post("", response_model=WebsiteResponse)
async def create_website(
    payload: WebsiteCreate,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    if payload.is_active:
        raise HTTPException(status_code=400, detail="请先保存站点并完成连接测试，再启用自动任务。")
    duplicate = (await db.execute(select(Website).where(Website.domain == payload.domain))).scalar_one_or_none()
    if duplicate:
        raise HTTPException(status_code=409, detail="该域名已存在，请编辑已有站点")
    try:
        website = Website(**_protect_website_secrets(payload.model_dump()))
    except SecretStorageError as exc:
        logger.error("Website credentials could not be protected: %s", exc)
        raise HTTPException(status_code=500, detail="Secure local credential storage is unavailable.") from exc
    db.add(website)
    await db.flush()
    await db.refresh(website)
    return website

@router.get("/{website_id}", response_model=WebsiteResponse)
async def get_website(
    website_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    website = await db.get(Website, website_id)
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")
    return website

@router.put("/{website_id}", response_model=WebsiteResponse)
async def update_website(
    website_id: int,
    payload: WebsiteUpdate,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    website = await db.get(Website, website_id)
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")
    
    data = payload.model_dump(exclude_unset=True)
    if "domain" in data and data["domain"] != website.domain:
        duplicate = (await db.execute(
            select(Website).where(Website.domain == data["domain"], Website.id != website_id)
        )).scalar_one_or_none()
        if duplicate:
            raise HTTPException(status_code=409, detail="该域名已存在，请编辑已有站点")

    cms_identity_fields = {"domain", "site_type", "shopify_access_token", "wp_username", "wp_app_password", "wp_api_url"}
    changes_binding = any(
        key in data
        and not (key in _SENSITIVE_FIELDS and _is_masked_secret(data[key]))
        and data[key] != getattr(website, key)
        for key in cms_identity_fields
    )
    if changes_binding:
        unfinished = (await db.execute(
            select(ContentOptimizationTask.id).where(
                ContentOptimizationTask.website_id == website_id,
                ContentOptimizationTask.status.in_(["draft", "approved"]),
            ).limit(1)
        )).scalar_one_or_none()
        if unfinished:
            raise HTTPException(
                status_code=409,
                detail="存在待处理的内容优化任务，请先处理或驳回后再修改 CMS 连接配置",
            )

    gsc_verification = None if (
        "gsc_site_url" in data and data["gsc_site_url"] != website.gsc_site_url
    ) else website.gsc_verified_at
    cms_verification = None if changes_binding else website.cms_verified_at
    next_site_type = data.get("site_type", website.site_type)
    if data.get("is_active", website.is_active):
        if not gsc_verification:
            raise HTTPException(status_code=400, detail="请先通过 GSC 连接测试，再启用站点。")
        if next_site_type != "generic" and not cms_verification:
            raise HTTPException(status_code=400, detail="请先通过 CMS 连接测试，再启用站点。")

    try:
        stored_data = _protect_website_secrets(data)
    except SecretStorageError as exc:
        logger.error("Website credentials could not be protected: %s", exc)
        raise HTTPException(status_code=500, detail="Secure local credential storage is unavailable.") from exc

    website.gsc_verified_at = gsc_verification
    website.cms_verified_at = cms_verification

    for key, value in stored_data.items():
        if key in _SENSITIVE_FIELDS and _is_masked_secret(value):
            continue
        setattr(website, key, value)
    
    await db.flush()
    await db.refresh(website)
    return website


@router.post("/{website_id}/test-gsc")
async def test_website_gsc_connection(
    website_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    website = await db.get(Website, website_id)
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")
    if not website.gsc_site_url:
        raise HTTPException(status_code=400, detail="该站点尚未配置 GSC 属性 URL")

    end_date = date.today() - timedelta(days=2)
    start_date = end_date - timedelta(days=2)
    try:
        await google_api_client.get_gsc_data(
            site_url=website.gsc_site_url,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            dimensions=["page"],
            website_id=website.id,
        )
    except Exception as exc:
        logger.warning("Website GSC connection test failed for %s: %s", website.domain, exc)
        raise HTTPException(status_code=400, detail=f"GSC 连接失败：{exc}") from exc
    website.gsc_verified_at = datetime.now(timezone.utc)
    await db.flush()
    return {
        "ok": True,
        "message": "GSC 连接成功",
        "verified_at": website.gsc_verified_at.isoformat(),
    }

@router.delete("/{website_id}")
async def delete_website(
    website_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    website = await db.get(Website, website_id)
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")
    
    await db.delete(website)
    await db.flush()
    return {"status": "success"}
