from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.api.auth import verify_admin_key
from app.models.setting import SystemSetting

router = APIRouter(prefix="/api/settings", tags=["Settings"])

class SettingUpdate(BaseModel):
    key: str
    value: str

class SettingResponse(BaseModel):
    key: str
    value: str
    updated_at: str

    class Config:
        from_attributes = True

@router.get("")
async def get_all_settings(
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SystemSetting)
    result = await db.execute(stmt)
    settings = result.scalars().all()
    return {s.key: s.value for s in settings}

@router.post("")
async def update_settings(
    payload: list[SettingUpdate],
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db)
):
    for item in payload:
        stmt = select(SystemSetting).where(SystemSetting.key == item.key)
        result = await db.execute(stmt)
        setting = result.scalar_one_or_none()
        
        if setting:
            setting.value = item.value
        else:
            setting = SystemSetting(key=item.key, value=item.value)
            db.add(setting)
            
    await db.flush()
    return {"status": "success"}

@router.get("/{key}")
async def get_setting(
    key: str,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SystemSetting).where(SystemSetting.key == key)
    result = await db.execute(stmt)
    setting = result.scalar_one_or_none()
    
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
        
    return {"key": setting.key, "value": setting.value}
