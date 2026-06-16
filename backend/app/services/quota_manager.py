from datetime import date, datetime, timezone
import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.quota import QuotaUsage
from app.models.task import TaskQueue

TASK_TYPE_TO_API: dict[str, str] = {
    "gsc_fetch": "gsc",
    "inspection": "inspection",
    "indexing": "indexing",
    "keyword_fetch": "gsc",
}

# 修复P1：模块级锁，防止并发调用时配额超颟消耗
_quota_lock = asyncio.Lock()


async def _get_quota_limits(db: AsyncSession) -> dict[str, int]:
    from app.models.setting import SystemSetting
    base_limits = {
        "gsc": settings.GSC_DAILY_LIMIT,
        "inspection": settings.INSPECTION_DAILY_LIMIT,
        "indexing": settings.INDEXING_DAILY_LIMIT,
    }
    try:
        stmt = select(SystemSetting).where(
            SystemSetting.key.in_(["GSC_DAILY_LIMIT", "INSPECTION_DAILY_LIMIT", "INDEXING_DAILY_LIMIT"])
        )
        result = await db.execute(stmt)
        db_settings = {s.key: s.value for s in result.scalars().all()}
        if "GSC_DAILY_LIMIT" in db_settings:
            base_limits["gsc"] = int(db_settings["GSC_DAILY_LIMIT"])
        if "INSPECTION_DAILY_LIMIT" in db_settings:
            base_limits["inspection"] = int(db_settings["INSPECTION_DAILY_LIMIT"])
        if "INDEXING_DAILY_LIMIT" in db_settings:
            base_limits["indexing"] = int(db_settings["INDEXING_DAILY_LIMIT"])
    except Exception:
        pass
    return base_limits


class QuotaManager:
    async def _get_or_create_usage(
        self, db: AsyncSession, api_type: str, usage_date: date, limit_count: int
    ) -> QuotaUsage:
        stmt = select(QuotaUsage).where(
            QuotaUsage.api_type == api_type,
            QuotaUsage.usage_date == usage_date,
        )
        result = await db.execute(stmt)
        usage = result.scalar_one_or_none()
        if usage is None:
            usage = QuotaUsage(
                api_type=api_type,
                usage_date=usage_date,
                used_count=0,
                limit_count=limit_count,
            )
            db.add(usage)
            await db.flush()
        else:
            if usage.limit_count != limit_count:
                usage.limit_count = limit_count
        return usage

    async def check_quota(self, db: AsyncSession, api_type: str) -> int:
        limits = await _get_quota_limits(db)
        today = date.today()
        limit = limits.get(api_type, 0)
        usage = await self._get_or_create_usage(db, api_type, today, limit)
        return max(0, usage.limit_count - usage.used_count)

    async def consume_quota(
        self, db: AsyncSession, api_type: str, count: int = 1
    ) -> bool:
        async with _quota_lock:  # 修复P1：用锁保证原子性
            limits = await _get_quota_limits(db)
            today = date.today()
            limit = limits.get(api_type, 0)
            usage = await self._get_or_create_usage(db, api_type, today, limit)
            remaining = usage.limit_count - usage.used_count
            if remaining < count:
                return False
            usage.used_count += count
            await db.flush()
            return True

    async def get_daily_status(self, db: AsyncSession) -> dict:
        limits = await _get_quota_limits(db)
        today = date.today()
        statuses: dict = {}
        for api_type, limit in limits.items():
            usage = await self._get_or_create_usage(db, api_type, today, limit)
            statuses[api_type] = {
                "api_type": api_type,
                "used": usage.used_count,
                "limit": usage.limit_count,
                "remaining": max(0, usage.limit_count - usage.used_count),
            }
        return statuses

    async def defer_overquota_tasks(self, db: AsyncSession) -> int:
        today = date.today()
        tomorrow = date.fromordinal(today.toordinal() + 1)
        deferred_count = 0

        for task_type, api_type in TASK_TYPE_TO_API.items():
            remaining = await self.check_quota(db, api_type)
            if remaining > 0:
                continue

            stmt = (
                select(TaskQueue)
                .where(
                    TaskQueue.task_type == task_type,
                    TaskQueue.status == "pending",
                    TaskQueue.scheduled_date == today,
                )
                .order_by(TaskQueue.priority_score.desc())
            )
            result = await db.execute(stmt)
            pending_tasks = result.scalars().all()

            for task in pending_tasks:
                task.scheduled_date = tomorrow
                task.status = "deferred"
                deferred_count += 1

        await db.flush()
        return deferred_count


quota_manager = QuotaManager()
