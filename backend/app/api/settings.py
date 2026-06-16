import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from google.oauth2 import service_account

from app.database import get_db
from app.api.auth import verify_admin_key
from app.models.setting import SystemSetting
from app.models.website import Website
from app.services.google_api import SCOPES, google_api_client
from app.services.secret_storage import PROTECTED_SETTING_KEYS, SecretStorageError, protect_secret

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["Settings"])

# 敏感字段：GET 接口返回时用 *** 脱敏
_SENSITIVE_KEYS = PROTECTED_SETTING_KEYS
_IMPORTED_GOOGLE_CREDENTIAL_KEYS = {
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_PROJECT_ID",
    "GOOGLE_TOKEN_URI",
}
_STATUS_SECRET_KEYS = {
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_PSI_API_KEY",
    "DINGTALK_WEBHOOK_URL",
    "WECOM_WEBHOOK_URL",
}
_CLEARABLE_SECRET_KEYS = _STATUS_SECRET_KEYS - {"GOOGLE_PRIVATE_KEY"}


class SettingUpdate(BaseModel):
    key: str
    value: str


class GoogleCredentialImport(BaseModel):
    credentials_json: str


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
    out: dict[str, str] = {}
    for s in settings:
        # 敏感字段脱敏：仅返回是否已设置，不返回实际值
        if s.key in _SENSITIVE_KEYS and s.value:
            out[s.key] = "***REDACTED***"
        else:
            out[s.key] = s.value
    return out


@router.post("")
async def update_settings(
    payload: list[SettingUpdate],
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db)
):
    for item in payload:
        if item.key in _IMPORTED_GOOGLE_CREDENTIAL_KEYS:
            raise HTTPException(
                status_code=400,
                detail="Google service account credentials must be configured by importing a JSON key file.",
            )
        # 跳过脱敏占位符，不写入数据库
        if item.value == "***REDACTED***":
            continue

        try:
            stored_value = protect_secret(item.value) if item.key in _SENSITIVE_KEYS else item.value
        except SecretStorageError as exc:
            logger.error("Setting '%s' could not be protected: %s", item.key, exc)
            raise HTTPException(status_code=500, detail="Secure local credential storage is unavailable.") from exc

        stmt = select(SystemSetting).where(SystemSetting.key == item.key)
        result = await db.execute(stmt)
        setting = result.scalar_one_or_none()

        if setting:
            if setting.value != stored_value:
                setting.value = stored_value
        else:
            setting = SystemSetting(key=item.key, value=stored_value)
            db.add(setting)

    await db.flush()

    return {"status": "success"}


@router.post("/google-credentials")
async def import_google_credentials(
    payload: GoogleCredentialImport,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    if len(payload.credentials_json) > 65536:
        raise HTTPException(status_code=400, detail="The selected service account key file is too large.")
    try:
        credential_info = json.loads(payload.credentials_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="The selected file is not valid JSON.") from exc

    required_fields = ("type", "project_id", "private_key", "client_email", "token_uri")
    if not isinstance(credential_info, dict) or any(
        not isinstance(credential_info.get(field), str) or not credential_info[field].strip()
        for field in required_fields
    ):
        raise HTTPException(status_code=400, detail="The selected file is not a complete service account key.")
    if credential_info["type"] != "service_account":
        raise HTTPException(status_code=400, detail="Only Google service account JSON keys are supported.")

    try:
        service_account.Credentials.from_service_account_info(credential_info, scopes=SCOPES)
        protected_private_key = protect_secret(credential_info["private_key"])
    except SecretStorageError as exc:
        logger.error("Google credential storage could not be protected: %s", exc)
        raise HTTPException(status_code=500, detail="Secure local credential storage is unavailable.") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="The service account private key is invalid.") from exc

    imported_values = {
        "GOOGLE_CLIENT_EMAIL": credential_info["client_email"].strip(),
        "GOOGLE_PROJECT_ID": credential_info["project_id"].strip(),
        "GOOGLE_TOKEN_URI": credential_info["token_uri"].strip(),
        "GOOGLE_PRIVATE_KEY": protected_private_key,
    }
    for key, value in imported_values.items():
        result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = value
        else:
            db.add(SystemSetting(key=key, value=value))

    await db.execute(update(Website).values(gsc_verified_at=None))
    await db.flush()
    google_api_client.clear_cache()
    logger.info("Imported protected Google service account credentials for project %s.", imported_values["GOOGLE_PROJECT_ID"])
    return {
        "status": "success",
        "configured": True,
        "client_email": imported_values["GOOGLE_CLIENT_EMAIL"],
        "project_id": imported_values["GOOGLE_PROJECT_ID"],
    }


@router.delete("/google-credentials")
async def clear_google_credentials(
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SystemSetting).where(SystemSetting.key.in_(_IMPORTED_GOOGLE_CREDENTIAL_KEYS)))
    for setting in result.scalars().all():
        setting.value = ""
    await db.execute(update(Website).values(gsc_verified_at=None))
    await db.flush()
    google_api_client.clear_cache()
    return {"status": "success"}


@router.get("/secret-status")
async def get_secret_status(
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SystemSetting).where(SystemSetting.key.in_(_STATUS_SECRET_KEYS)))
    stored = {setting.key: setting for setting in result.scalars().all()}
    return {
        key: {
            "configured": bool(stored.get(key) and stored[key].value),
            "updated_at": stored[key].updated_at.isoformat() if stored.get(key) and stored[key].updated_at else None,
        }
        for key in _STATUS_SECRET_KEYS
    }


@router.delete("/secrets/{key}")
async def clear_secret(
    key: str,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    if key not in _CLEARABLE_SECRET_KEYS:
        raise HTTPException(status_code=400, detail="This secret cannot be cleared through this endpoint.")
    setting = (await db.execute(select(SystemSetting).where(SystemSetting.key == key))).scalar_one_or_none()
    if setting:
        setting.value = ""
        await db.flush()
    return {"status": "success"}


@router.get("/gsc-sites")
async def list_gsc_sites(
    api_key: str = Depends(verify_admin_key),
):
    try:
        return await google_api_client.list_gsc_sites()
    except Exception as exc:
        logger.warning("Could not list GSC properties: %s", type(exc).__name__)
        raise HTTPException(status_code=400, detail="无法读取 Search Console 属性，请检查密钥和授权。") from exc


@router.get("/test-gsc")
async def test_gsc_connection(
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db)
):
    """真正测试 Google Search Console API 连通性"""
    from app.models.setting import SystemSetting
    from sqlalchemy import select as sa_select

    # 读取 site_url
    stmt = sa_select(SystemSetting).where(SystemSetting.key == "GOOGLE_SITE_URL")
    result = await db.execute(stmt)
    site_setting = result.scalar_one_or_none()
    from app.config import settings as app_settings
    site_url = site_setting.value if site_setting and site_setting.value else app_settings.GOOGLE_SITE_URL

    if not site_url:
        raise HTTPException(status_code=400, detail="未配置 GOOGLE_SITE_URL，无法测试连接")

    try:
        from datetime import date, timedelta
        end_date = date.today() - timedelta(days=1)
        start_date = end_date - timedelta(days=3)
        await google_api_client.get_gsc_data(
            site_url=site_url,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            dimensions=["page"],
        )
        return {"status": "ok", "message": "GSC API 连接成功"}
    except Exception as e:
        logger.warning("GSC connection test failed: %s", e)
        raise HTTPException(status_code=400, detail=f"GSC API 连接失败：{str(e)}")


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

    value = "***REDACTED***" if key in _SENSITIVE_KEYS and setting.value else setting.value
    return {"key": setting.key, "value": value}
