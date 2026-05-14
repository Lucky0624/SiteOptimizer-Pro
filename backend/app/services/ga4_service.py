import asyncio
from typing import Any

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

from app.config import settings
from app.services.google_api import google_api_client


class GA4Service:
    def __init__(self) -> None:
        self.client = None

    async def _get_client(self):
        if BetaAnalyticsDataClient is None:
            return None
        if self.client is None:
            creds = await google_api_client._get_credentials()
            self.client = BetaAnalyticsDataClient(credentials=creds)
        return self.client

    async def get_report(self, property_id: str, start_date: str, end_date: str) -> list[dict[str, Any]]:
        client = await self._get_client()
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
            print(f"GA4 API Error: {e}")
            return []


ga4_service = GA4Service()
