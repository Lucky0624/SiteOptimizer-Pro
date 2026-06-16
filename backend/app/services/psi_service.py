import logging
import httpx
from typing import Dict, Any

from app.config import settings
from app.services.secret_storage import reveal_secret

logger = logging.getLogger(__name__)

class PSIService:
    def __init__(self) -> None:
        self.base_url = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

    async def get_page_speed_metrics(self, url: str, strategy: str = "mobile") -> Dict[str, Any]:
        """
        Fetch PageSpeed Insights data for a specific URL.
        Strategy can be 'mobile' or 'desktop'.
        """
        from app.database import async_session
        from app.models.setting import SystemSetting
        from sqlalchemy import select

        api_key = settings.GOOGLE_PSI_API_KEY
        async with async_session() as db:
            stmt = select(SystemSetting).where(SystemSetting.key == "GOOGLE_PSI_API_KEY")
            result = await db.execute(stmt)
            db_setting = result.scalar_one_or_none()
            if db_setting:
                api_key = reveal_secret(db_setting.value)

        params = {
            "url": url,
            "key": api_key,
            "strategy": strategy,
            "category": ["performance"]
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                data = response.json()
                
                # Extract Lighthouse & Core Web Vitals
                lighthouse_result = data.get("lighthouseResult", {})
                audits = lighthouse_result.get("audits", {})
                loading_experience = data.get("loadingExperience", {})
                metrics = loading_experience.get("metrics", {})
                
                # Performance Score (0-100)
                perf_score = int(lighthouse_result.get("categories", {}).get("performance", {}).get("score", 0) * 100)
                
                # Largest Contentful Paint (LCP)
                lcp = audits.get("largest-contentful-paint", {}).get("numericValue", 0)
                
                # Cumulative Layout Shift (CLS)
                cls = audits.get("cumulative-layout-shift", {}).get("numericValue", 0)
                
                # Total Blocking Time (TBT) - used as a proxy for FID in lab data
                tbt = audits.get("total-blocking-time", {}).get("numericValue", 0)
                
                return {
                    "performance_score": perf_score,
                    "lcp": lcp,
                    "cls": cls,
                    "tbt": tbt,
                    "full_data": data if settings.DEBUG else None
                }
            except Exception as e:
                logger.error("PSI request failed for %s (%s)", url, type(e).__name__)
                return {
                    "error": "PageSpeed Insights request failed",
                    "performance_score": 0,
                    "lcp": 0,
                    "cls": 0,
                    "tbt": 0
                }

psi_service = PSIService()
