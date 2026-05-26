import logging
from datetime import datetime, timezone, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.secret_storage import reveal_secret

logger = logging.getLogger(__name__)

_WEBHOOK_KEYS = ("DINGTALK_WEBHOOK_URL", "WECOM_WEBHOOK_URL")
# 防抖窗口：同类型告警 6 小时内不重复发送
_DEBOUNCE_HOURS = 6


async def _get_webhook_urls(db: AsyncSession | None = None) -> dict[str, str]:
    from app.config import settings
    urls = {
        "dingtalk": settings.DINGTALK_WEBHOOK_URL,
        "wecom": settings.WECOM_WEBHOOK_URL,
    }
    if db is None:
        return urls
    try:
        from app.models.setting import SystemSetting
        stmt = select(SystemSetting).where(SystemSetting.key.in_(list(_WEBHOOK_KEYS)))
        result = await db.execute(stmt)
        db_settings = {s.key: s.value for s in result.scalars().all()}
        if "DINGTALK_WEBHOOK_URL" in db_settings:
            urls["dingtalk"] = reveal_secret(db_settings["DINGTALK_WEBHOOK_URL"])
        if "WECOM_WEBHOOK_URL" in db_settings:
            urls["wecom"] = reveal_secret(db_settings["WECOM_WEBHOOK_URL"])
    except Exception as e:
        logger.warning("Failed to load webhook URLs from DB: %s", e)
    return urls


async def _check_debounce(alert_type: str, db: AsyncSession) -> bool:
    """检查同类型告警是否在防抖窗口内已发送，True = 需要跳过"""
    try:
        from app.models.alert_log import AlertLog
        cutoff = datetime.now(timezone.utc) - timedelta(hours=_DEBOUNCE_HOURS)
        stmt = select(AlertLog).where(
            AlertLog.alert_type == alert_type,
            AlertLog.sent_at >= cutoff,
        ).limit(1)
        result = await db.execute(stmt)
        return result.scalar_one_or_none() is not None
    except Exception as e:
        logger.warning("Debounce check failed: %s", e)
        return False


async def _record_alert(alert_type: str, message: str, website_id: int | None, db: AsyncSession) -> None:
    """写入告警历史记录"""
    try:
        from app.models.alert_log import AlertLog
        log = AlertLog(
            alert_type=alert_type,
            message=message[:1000],
            website_id=website_id,
            channel="webhook",
            sent_at=datetime.now(timezone.utc),
        )
        db.add(log)
        await db.flush()
    except Exception as e:
        logger.warning("Failed to record alert log: %s", e)


class AlertManager:
    async def send_dingtalk_alert(self, message: str, db: AsyncSession | None = None) -> None:
        webhook_urls = await _get_webhook_urls(db)
        url = webhook_urls.get("dingtalk", "")
        if not url:
            return
        payload = {"msgtype": "text", "text": {"content": f"【SiteOptimizer Pro 告警】\n{message}"}}
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                await client.post(url, json=payload)
            except Exception as e:
                logger.error("DingTalk alert failed (%s)", type(e).__name__)

    async def send_wecom_alert(self, message: str, db: AsyncSession | None = None) -> None:
        webhook_urls = await _get_webhook_urls(db)
        url = webhook_urls.get("wecom", "")
        if not url:
            return
        payload = {"msgtype": "text", "text": {"content": f"SiteOptimizer Pro 告警：\n{message}"}}
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                await client.post(url, json=payload)
            except Exception as e:
                logger.error("WeCom alert failed (%s)", type(e).__name__)

    async def broadcast_alert(
        self,
        alert_type: str,
        message: str,
        db: AsyncSession | None = None,
        website_id: int | None = None,
        skip_debounce: bool = False,
    ) -> None:
        """统一发送告警，内置防抖 + 历史记录"""
        if db and not skip_debounce:
            if await _check_debounce(alert_type, db):
                logger.debug("Alert '%s' skipped (debounce window %dh)", alert_type, _DEBOUNCE_HOURS)
                return

        await self.send_dingtalk_alert(message, db)
        await self.send_wecom_alert(message, db)

        if db:
            await _record_alert(alert_type, message, website_id, db)

    async def alert_quota_low(self, api_type: str, used: int, limit: int, db: AsyncSession | None = None) -> None:
        remaining_pct = (limit - used) / limit * 100 if limit > 0 else 0
        if remaining_pct <= 10:
            msg = (
                f"⚠️ API 配额告警\n接口：{api_type.upper()}\n"
                f"已用：{used:,} / {limit:,}\n剩余：{limit - used:,}（{remaining_pct:.1f}%）\n"
                f"请注意控制请求量，避免超出每日限额！"
            )
            await self.broadcast_alert("quota_low", msg, db)

    async def alert_traffic_decay(self, domain: str, decaying_count: int, db: AsyncSession | None = None, website_id: int | None = None) -> None:
        if decaying_count > 0:
            msg = (
                f"📉 流量衰退告警\n站点：{domain}\n衰退页面数：{decaying_count} 个\n"
                f"请登录 SiteOptimizer Pro 查看详情并采取优化措施。"
            )
            await self.broadcast_alert("traffic_decay", msg, db, website_id=website_id)

    async def alert_seo_cycle_failed(self, error: str, db: AsyncSession | None = None) -> None:
        msg = f"🚨 SEO 自动化循环失败\n错误信息：{error[:200]}\n请检查后端日志了解详情。"
        await self.broadcast_alert("seo_cycle_failed", msg, db, skip_debounce=True)

    async def alert_url_deindexed(self, url: str, db: AsyncSession | None = None, website_id: int | None = None) -> None:
        msg = f"🔴 URL 索引移除告警\nURL：{url}\n该页面已被 Google 移出索引，请排查原因。"
        await self.broadcast_alert("url_deindexed", msg, db, website_id=website_id)

    async def alert_lcp_slow(self, url: str, lcp_ms: float, threshold_ms: float, db: AsyncSession | None = None, website_id: int | None = None) -> None:
        msg = (
            f"🐢 页面速度告警\nURL：{url}\n"
            f"LCP：{lcp_ms / 1000:.2f}s（阈值：{threshold_ms / 1000:.2f}s）\n请优化页面加载性能。"
        )
        await self.broadcast_alert("lcp_slow", msg, db, website_id=website_id)


alert_manager = AlertManager()
