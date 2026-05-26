import asyncio
import logging
import httpx
from urllib.parse import quote
from sqlalchemy import select
from google.oauth2 import service_account
from google.auth.transport.requests import Request

from app.config import settings
from app.services.secret_storage import SecretStorageError, reveal_secret

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/indexing",
]
DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token"


class GoogleAPIClient:
    def __init__(self) -> None:
        self._credentials_cache: dict[int, service_account.Credentials] = {}
        self._global_credentials: service_account.Credentials | None = None
        self._http_client: httpx.AsyncClient | None = None

    async def _get_db_settings(self) -> dict:
        from app.database import async_session
        from app.models.setting import SystemSetting
        async with async_session() as db:
            stmt = select(SystemSetting)
            result = await db.execute(stmt)
            settings_list = result.scalars().all()
            db_settings = {s.key: s.value for s in settings_list}
            stored_private_key = db_settings.get("GOOGLE_PRIVATE_KEY")
            if stored_private_key:
                try:
                    db_settings["GOOGLE_PRIVATE_KEY"] = reveal_secret(stored_private_key)
                except SecretStorageError as exc:
                    raise GoogleAPIError("Stored Google credentials cannot be decrypted.") from exc
            return db_settings

    async def _refresh_creds(self, creds: service_account.Credentials) -> None:
        """修复P1：使用 run_in_executor 包裹同步的凭据刷新，避免阻塞事件循环"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, creds.refresh, Request())

    async def _get_website_credentials(self, website_id: int | None = None) -> service_account.Credentials:
        if website_id and website_id in self._credentials_cache:
            creds = self._credentials_cache[website_id]
            if not creds.valid:
                await self._refresh_creds(creds)
            return creds

        if website_id:
            from app.database import async_session
            from app.models.website import Website
            async with async_session() as db:
                stmt = select(Website).where(Website.id == website_id)
                result = await db.execute(stmt)
                website = result.scalar_one_or_none()
                if website and website.gsc_site_url:
                    db_settings = await self._get_db_settings()
                    email = db_settings.get("GOOGLE_CLIENT_EMAIL") or settings.GOOGLE_CLIENT_EMAIL
                    key = db_settings.get("GOOGLE_PRIVATE_KEY") or settings.GOOGLE_PRIVATE_KEY
                    if email and key:
                        creds = service_account.Credentials.from_service_account_info(
                            {
                                "client_email": email,
                                "private_key": key.replace("\\n", "\n"),
                                "token_uri": db_settings.get("GOOGLE_TOKEN_URI") or DEFAULT_TOKEN_URI,
                            },
                            scopes=SCOPES,
                        )
                        await self._refresh_creds(creds)
                        self._credentials_cache[website_id] = creds
                        return creds

        if self._global_credentials is None:
            db_settings = await self._get_db_settings()
            email = db_settings.get("GOOGLE_CLIENT_EMAIL") or settings.GOOGLE_CLIENT_EMAIL
            key = db_settings.get("GOOGLE_PRIVATE_KEY") or settings.GOOGLE_PRIVATE_KEY
            if not email or not key:
                raise GoogleAPIError("Google API credentials not configured")
            self._global_credentials = service_account.Credentials.from_service_account_info(
                {
                    "client_email": email,
                    "private_key": key.replace("\\n", "\n"),
                    "token_uri": db_settings.get("GOOGLE_TOKEN_URI") or DEFAULT_TOKEN_URI,
                },
                scopes=SCOPES,
            )

        if not self._global_credentials.valid:
            await self._refresh_creds(self._global_credentials)

        return self._global_credentials

    async def _get_headers(self, website_id: int | None = None) -> dict[str, str]:
        creds = await self._get_website_credentials(website_id)
        if not creds.token:
            await self._refresh_creds(creds)
        return {"Authorization": f"Bearer {creds.token}", "Content-Type": "application/json"}

    async def _get_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=60.0)
        return self._http_client

    def _site_url_path(self, site_url: str) -> str:
        return quote(site_url, safe="")

    async def close(self) -> None:
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()

    def clear_cache(self, website_id: int | None = None) -> None:
        """清除凭据缓存，同时通知 GA4Service 重置客户端"""
        if website_id and website_id in self._credentials_cache:
            del self._credentials_cache[website_id]
        elif website_id is None:
            self._credentials_cache.clear()
            self._global_credentials = None

        # 修复P0：同步清空 GA4 客户端，避免旧凭据持久化
        try:
            from app.services.ga4_service import ga4_service
            ga4_service.invalidate_client()
        except Exception:
            pass

    async def get_gsc_data(
        self,
        site_url: str,
        start_date: str,
        end_date: str,
        dimensions: list[str] | None = None,
        website_id: int | None = None,
    ) -> list[dict]:
        if dimensions is None:
            dimensions = ["page"]
        headers = await self._get_headers(website_id)
        client = await self._get_client()
        url = f"https://searchconsole.googleapis.com/webmasters/v3/sites/{self._site_url_path(site_url)}/searchAnalytics/query"
        payload = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": dimensions,
            "rowLimit": 25000,
        }
        try:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            return data.get("rows", [])
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise QuotaExceededError("GSC API quota exceeded") from e
            raise GoogleAPIError(f"GSC API error: {e.response.status_code}") from e
        except Exception as e:
            raise GoogleAPIError(f"GSC API error: {str(e)}") from e

    async def list_gsc_sites(self) -> list[dict[str, str]]:
        """Return Search Console properties available to the configured account."""
        headers = await self._get_headers()
        client = await self._get_client()
        try:
            resp = await client.get(
                "https://www.googleapis.com/webmasters/v3/sites",
                headers=headers,
            )
            resp.raise_for_status()
            entries = resp.json().get("siteEntry", [])
            return [
                {
                    "site_url": entry.get("siteUrl", ""),
                    "permission_level": entry.get("permissionLevel", ""),
                }
                for entry in entries
                if entry.get("siteUrl")
            ]
        except httpx.HTTPStatusError as exc:
            raise GoogleAPIError(f"GSC property list error: {exc.response.status_code}") from exc
        except Exception as exc:
            raise GoogleAPIError("GSC property list could not be loaded") from exc

    async def get_gsc_keyword_data(
        self,
        site_url: str,
        page_url: str,
        start_date: str,
        end_date: str,
        website_id: int | None = None,
    ) -> list[dict]:
        """Fetch daily page/query performance rows suitable for trend snapshots."""
        headers = await self._get_headers(website_id)
        client = await self._get_client()
        url = f"https://searchconsole.googleapis.com/webmasters/v3/sites/{self._site_url_path(site_url)}/searchAnalytics/query"
        payload = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": ["date", "page", "query"],
            "dimensionFilterGroups": [{
                "filters": [{
                    "dimension": "page",
                    "operator": "equals",
                    "expression": page_url,
                }]
            }],
            "rowLimit": 25000,
        }
        try:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            return data.get("rows", [])
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise QuotaExceededError("GSC API quota exceeded") from e
            raise GoogleAPIError(f"GSC keyword API error: {e.response.status_code}") from e
        except Exception as e:
            raise GoogleAPIError(f"GSC keyword API error: {str(e)}") from e

    async def inspect_url(self, site_url: str, inspection_url: str, website_id: int | None = None) -> dict:
        headers = await self._get_headers(website_id)
        client = await self._get_client()
        payload = {
            "inspectionUrl": inspection_url,
            "siteUrl": site_url,
            "languageCode": "zh-CN",
        }
        try:
            resp = await client.post(
                "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
            inspection_result = data.get("inspectionResult", {})
            index_status = inspection_result.get("indexStatusResult", {})
            return {
                "verdict": index_status.get("verdict", "UNKNOWN"),
                "coverage_state": index_status.get("coverageState", ""),
                "last_crawl_time": index_status.get("lastCrawlTime", ""),
                "page_fetch_state": index_status.get("pageFetchState", ""),
                "robotstxt_status": index_status.get("robotstxtStatus", ""),
            }
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise QuotaExceededError("Inspection API quota exceeded") from e
            raise GoogleAPIError(f"Inspection API error: {e.response.status_code}") from e
        except Exception as e:
            raise GoogleAPIError(f"Inspection API error: {str(e)}") from e

    async def submit_for_indexing(self, url: str, website_id: int | None = None) -> dict:
        headers = await self._get_headers(website_id)
        client = await self._get_client()
        try:
            resp = await client.post(
                "https://indexing.googleapis.com/v3/urlNotifications:publish",
                json={"url": url, "type": "URL_UPDATED"},
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise QuotaExceededError("Indexing API quota exceeded") from e
            raise GoogleAPIError(f"Indexing API error: {e.response.status_code}") from e
        except Exception as e:
            raise GoogleAPIError(f"Indexing API error: {str(e)}") from e


class GoogleAPIError(Exception):
    pass


class QuotaExceededError(GoogleAPIError):
    pass


google_api_client = GoogleAPIClient()
