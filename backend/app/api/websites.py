from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import verify_admin_key
from app.models.website import Website
from app.schemas.website import WebsiteCreate, WebsiteUpdate, WebsiteResponse, WebsiteListResponse

router = APIRouter(prefix="/api/websites", tags=["Websites"])

@router.get("", response_model=WebsiteListResponse)
async def list_websites(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    site_type: str | None = Query(None),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Website)
    if site_type:
        stmt = stmt.where(Website.site_type == site_type)
    
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()
    
    return WebsiteListResponse(items=list(items), total=total)

@router.post("", response_model=WebsiteResponse)
async def create_website(
    payload: WebsiteCreate,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    website = Website(**payload.model_dump())
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
    for key, value in data.items():
        setattr(website, key, value)
    
    await db.flush()
    await db.refresh(website)
    return website

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
