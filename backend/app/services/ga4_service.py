import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

try:
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        DateRange,
        Dimension,
        Metric,
        RunReportRequest,
    )
except ImportError:
    BetaAnalyticsDataClient = None

from app.services.google_api import google_api_client


class GA4Service:
    def __init__(self) -> None:
        self.clients = {}

    def invalidate_client(self, website_id: int | None = None) -> None:
        """修复P0：凭据更新后清空客户端缓存，强制重新初始化"""
        if website_id is None:
            self.clients.clear()
        else:
            self.clients.pop(website_id, None)

    async def _get_client(self, website_id: int | None = None):
        if BetaAnalyticsDataClient is None:
            logger.warning("google-analytics-data package not installed, GA4 disabled.")
            return None
        cache_key = website_id or 0
        if cache_key not in self.clients:
            try:
                creds = await google_api_client._get_website_credentials(website_id)
                self.clients[cache_key] = BetaAnalyticsDataClient(credentials=creds)
            except Exception as e:
                logger.error("Failed to initialize GA4 client: %s", e)
                return None
        return self.clients[cache_key]

    async def get_report(
        self,
        property_id: str,
        start_date: str,
        end_date: str,
        website_id: int | None = None,
    ) -> list[dict[str, Any]]:
        client = await self._get_client(website_id)
        if client is None:
            return []

        request = RunReportRequest(
            property=f"properties/{property_id}",
            dimensions=[Dimension(name="pagePath")],
            metrics=[
                Metric(name="activeUsers"),
                Metric(name="sessions"),
                Metric(name="bounceRate"),
                Metric(name="conversions"),
                Metric(name="averageSessionDuration"),
            ],
            date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
        )

        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, client.run_report, request)
            results = []
            for row in response.rows:
                results.append({
                    "page_path": row.dimension_values[0].value,
                    "active_users": int(row.metric_values[0].value),
                    "sessions": int(row.metric_values[1].value),
                    "bounce_rate": float(row.metric_values[2].value),
                    "conversions": int(row.metric_values[3].value),
                    "avg_duration": float(row.metric_values[4].value),
                })
            return results
        except Exception as e:
            logger.exception("GA4 API Error for property %s: %s", property_id, e)
            return []


ga4_service = GA4Service()
