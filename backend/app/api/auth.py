import secrets

from fastapi import Header, HTTPException

from app.config import settings


async def verify_admin_key(api_key: str = Header(..., alias="X-Admin-Key")) -> str:
    if not secrets.compare_digest(api_key, settings.ADMIN_KEY):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    return api_key
