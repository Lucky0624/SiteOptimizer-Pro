import httpx
from sqlalchemy import select
from google.oauth2 import service_account
from google.auth.transport.requests import Request

from app.config import settings


SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/indexing",
]


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
            return {s.key: s.value for s in settings_list}

    async def _get_website_credentials(self, website_id: int | None = None) -> service_account.Credentials:
        if website_id and website_id in self._credentials_cache:
            creds = self._credentials_cache[website_id]
            if not creds.valid:
                request = Request()
                creds.refresh(request)
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
                            {"client_email": email, "private_key": key.replace("\\n", "\n")},
                            scopes=SCOPES,
                        )
                        request = Request()
                        creds.refresh(request)
                        self._credentials_cache[website_id] = creds
                        return creds

        if self._global_credentials is None:
            db_settings = await self._get_db_settings()
            email = db_settings.get("GOOGLE_CLIENT_EMAIL") or settings.GOOGLE_CLIENT_EMAIL
            key = db_settings.get("GOOGLE_PRIVATE_KEY") or settings.GOOGLE_PRIVATE_KEY
            if not email or not key:
                raise GoogleAPIError("Google API credentials not configured")
            self._global_credentials = service_account.Credentials.from_service_account_info(
                {"client_email": email, "private_key": key.replace("\\n", "\n")},
                scopes=SCOPES,
            )

        if not self._global_credentials.valid:
            request = Request()
            self._global_credentials.refresh(request)

        return self._global_credentials

    async def _get_headers(self, website_id: int | None = None) -> dict[str, str]:
        creds = await self._get_website_credentials(website_id)
        token = creds.token
        if not token:
            request = Request()
            creds.refresh(request)
            token = creds.token
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async def _get_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=60.0)
        return self._http_client

    async def close(self) -> None:
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()

    def clear_cache(self, website_id: int | None = None) -> None:
        if website_id and website_id in self._credentials_cache:
            del self._credentials_cache[website_id]
        elif website_id is None:
            self._credentials_cache.clear()
            self._global_credentials = None

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
        url = f"https://searchconsole.googleapis.com/webmasters/v3/sites/{site_url}/searchAnalytics/query"
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
