import base64
import ctypes
import os
from ctypes import wintypes


_DPAPI_PREFIX = "protected:v1:dpapi:"
_FERNET_PREFIX = "protected:v1:fernet:"
_DPAPI_ENTROPY = b"SiteOptimizer Pro local credential storage v1"
PROTECTED_SETTING_KEYS = frozenset({
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_PSI_API_KEY",
    "SHOPIFY_ACCESS_TOKEN",
    "WP_APP_PASSWORD",
    "DINGTALK_WEBHOOK_URL",
    "WECOM_WEBHOOK_URL",
})
PROTECTED_WEBSITE_FIELDS = frozenset({"shopify_access_token", "wp_app_password"})


class SecretStorageError(RuntimeError):
    pass


def is_protected_secret(value: str) -> bool:
    return value.startswith((_DPAPI_PREFIX, _FERNET_PREFIX))


def protect_secret(value: str) -> str:
    if not value or is_protected_secret(value):
        return value
    if os.name == "nt":
        protected = _dpapi_protect(value.encode("utf-8"))
        return _DPAPI_PREFIX + base64.urlsafe_b64encode(protected).decode("ascii")
    return _FERNET_PREFIX + _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def reveal_secret(value: str) -> str:
    if not value:
        return value
    if value.startswith(_DPAPI_PREFIX):
        if os.name != "nt":
            raise SecretStorageError("Windows-protected credential cannot be opened on this operating system.")
        encrypted = _decode_payload(value, _DPAPI_PREFIX)
        return _dpapi_unprotect(encrypted).decode("utf-8")
    if value.startswith(_FERNET_PREFIX):
        encrypted = value[len(_FERNET_PREFIX):].encode("ascii")
        try:
            return _fernet().decrypt(encrypted).decode("utf-8")
        except Exception as exc:
            raise SecretStorageError("Credential decryption failed.") from exc
    return value


def _decode_payload(value: str, prefix: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(value[len(prefix):].encode("ascii"))
    except Exception as exc:
        raise SecretStorageError("Credential payload is invalid.") from exc


def _fernet():
    key = os.getenv("CREDENTIAL_ENCRYPTION_KEY", "")
    if not key:
        try:
            from app.config import settings
            key = settings.CREDENTIAL_ENCRYPTION_KEY
        except Exception:
            key = ""
    if not key:
        raise SecretStorageError(
            "CREDENTIAL_ENCRYPTION_KEY must be configured for local credential storage on this operating system."
        )
    try:
        from cryptography.fernet import Fernet
        return Fernet(key.encode("ascii"))
    except Exception as exc:
        raise SecretStorageError("CREDENTIAL_ENCRYPTION_KEY is not a valid Fernet key.") from exc


class _DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_char)),
    ]


def _blob(data: bytes) -> tuple[_DataBlob, ctypes.Array]:
    buffer = ctypes.create_string_buffer(data)
    return _DataBlob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char))), buffer


def _dpapi_protect(data: bytes) -> bytes:
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    input_blob, input_buffer = _blob(data)
    entropy_blob, entropy_buffer = _blob(_DPAPI_ENTROPY)
    output_blob = _DataBlob()
    _ = input_buffer, entropy_buffer
    result = crypt32.CryptProtectData(
        ctypes.byref(input_blob),
        "SiteOptimizer Pro credential",
        ctypes.byref(entropy_blob),
        None,
        None,
        0x01,
        ctypes.byref(output_blob),
    )
    if not result:
        raise SecretStorageError(f"Windows credential protection failed: {ctypes.WinError()}")
    try:
        return ctypes.string_at(output_blob.pbData, output_blob.cbData)
    finally:
        kernel32.LocalFree(output_blob.pbData)


def _dpapi_unprotect(data: bytes) -> bytes:
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    input_blob, input_buffer = _blob(data)
    entropy_blob, entropy_buffer = _blob(_DPAPI_ENTROPY)
    output_blob = _DataBlob()
    description = wintypes.LPWSTR()
    _ = input_buffer, entropy_buffer
    result = crypt32.CryptUnprotectData(
        ctypes.byref(input_blob),
        ctypes.byref(description),
        ctypes.byref(entropy_blob),
        None,
        None,
        0x01,
        ctypes.byref(output_blob),
    )
    if not result:
        raise SecretStorageError(f"Windows credential decryption failed: {ctypes.WinError()}")
    try:
        return ctypes.string_at(output_blob.pbData, output_blob.cbData)
    finally:
        kernel32.LocalFree(output_blob.pbData)
        if description:
            kernel32.LocalFree(description)


async def migrate_legacy_secrets() -> int:
    from sqlalchemy import select

    from app.database import async_session
    from app.models.setting import SystemSetting
    from app.models.website import Website

    async with async_session() as db:
        migrated_count = 0
        settings_result = await db.execute(
            select(SystemSetting).where(SystemSetting.key.in_(PROTECTED_SETTING_KEYS))
        )
        for setting in settings_result.scalars().all():
            if setting.value and not is_protected_secret(setting.value):
                setting.value = protect_secret(setting.value)
                migrated_count += 1

        websites_result = await db.execute(select(Website))
        for website in websites_result.scalars().all():
            for field in PROTECTED_WEBSITE_FIELDS:
                value = getattr(website, field)
                if value and not is_protected_secret(value):
                    setattr(website, field, protect_secret(value))
                    migrated_count += 1

        if migrated_count:
            await db.commit()
        return migrated_count
