import logging
from datetime import date, datetime, timezone, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.website import Website
from app.models.url import URLRecord
from app.models.snapshot import PerformanceSnapshot
from app.models.keyword import KeywordSnapshot
from app.models.task import TaskQueue
from app.services.google_api import google_api_client, GoogleAPIError, QuotaExceededError
from app.services.quota_manager import quota_manager, TASK_TYPE_TO_API
from app.services.priority_engine import priority_engine
from app.services.tag_engine import tag_engine
from app.config import settings

logger = logging.getLogger(__name__)


class TaskScheduler:
    async def schedule_daily_tasks(
        self,
        db: AsyncSession,
        website_id: int | None = None,
        include_gsc_fetch: bool = True,
    ) -> int:
        today = date.today()
        top_urls = await priority_engine.get_top_priority_urls(db, limit=200, website_id=website_id)

        created = 0
        for url_record in top_urls:
            task_types: list[str] = []
            tag_names = [t.tag_name for t in url_record.tags]
            has_gsc_property = (
                bool(url_record.website and url_record.website.gsc_site_url)
                or bool(not url_record.website and settings.GOOGLE_SITE_URL)
            )

            if ("Excluded" in tag_names or "Need_Recrawl" in tag_names) and has_gsc_property:
                task_types.append("inspection")
            if "Excluded" in tag_names:
                task_types.append("indexing")
            if (
                ("Opportunity" in tag_names or "High_Impression" in tag_names)
                and bool(url_record.website and url_record.website.gsc_site_url)
            ):
                task_types.append("keyword_fetch")

            if include_gsc_fetch and has_gsc_property:
                task_types.append("gsc_fetch")

            for task_type in task_types:
                existing_stmt = select(TaskQueue).where(
                    TaskQueue.url_id == url_record.id,
                    TaskQueue.scheduled_date == today,
                    TaskQueue.task_type == task_type,
                )
                existing_result = await db.execute(existing_stmt)
                if existing_result.scalar_one_or_none():
                    continue

                task = TaskQueue(
                    url_id=url_record.id,
                    task_type=task_type,
                    priority_score=url_record.priority_score,
                    status="pending",
                    scheduled_date=today,
                )
                db.add(task)
                created += 1

        await db.flush()
        return created

    async def execute_task(self, db: AsyncSession, task: TaskQueue) -> bool:
        api_type = TASK_TYPE_TO_API.get(task.task_type)
        if not api_type:
            task.status = "failed"
            task.error_message = f"Unknown task type: {task.task_type}"
            await db.flush()
            return False

        has_quota = await quota_manager.consume_quota(db, api_type)
        if not has_quota:
            task.status = "deferred"
            await db.flush()
            return False

        task.status = "running"
        await db.flush()

        url_record_stmt = (
            select(URLRecord)
            .where(URLRecord.id == task.url_id)
            .options(selectinload(URLRecord.website))
        )
        url_result = await db.execute(url_record_stmt)
        url_record = url_result.scalar_one_or_none()

        if not url_record:
            task.status = "failed"
            task.error_message = "URL record not found"
            await db.flush()
            return False

        try:
            result: dict = {}

            if task.task_type == "gsc_fetch":
                result = await self._execute_gsc_fetch(db, url_record)
            elif task.task_type == "inspection":
                result = await self._execute_inspection(db, url_record)
            elif task.task_type == "indexing":
                result = await self._execute_indexing(url_record)
            elif task.task_type == "keyword_fetch":
                result = await self._execute_keyword_fetch(db, url_record)

            task.status = "completed"
            task.executed_at = datetime.now(timezone.utc)
            task.result_summary = str(result)
            url_record.last_crawled_at = datetime.utcnow()
            await db.flush()
            return True

        except QuotaExceededError as e:
            task.status = "deferred"
            task.error_message = str(e)
            await db.flush()
            return False

        except GoogleAPIError as e:
            task.retry_count += 1
            task.status = "failed" if task.retry_count >= task.max_retries else "pending"
            task.error_message = str(e)
            await db.flush()
            return False

        except Exception as e:
            task.retry_count += 1
            task.status = "failed" if task.retry_count >= task.max_retries else "pending"
            task.error_message = str(e)
            logger.exception("Unexpected error executing task %d", task.id)
            await db.flush()
            return False

    async def _execute_gsc_fetch(self, db: AsyncSession, url_record: URLRecord) -> dict:
        """修复：针对单 URL 精确查询，写入快照，不再全量拉取后逐行比对"""
        if url_record.website and not url_record.website.gsc_site_url:
            return {"status": "skipped", "reason": "Website has no GSC property URL configured"}
        if not url_record.website and not settings.GOOGLE_SITE_URL:
            return {"status": "skipped", "reason": "No GSC property URL configured"}

        end_date = date.today() - timedelta(days=1)
        start_date = end_date - timedelta(days=7)

        site_url = settings.GOOGLE_SITE_URL
        if url_record.website and url_record.website.gsc_site_url:
            site_url = url_record.website.gsc_site_url

        website_id = url_record.website.id if url_record.website else None

        rows = await google_api_client.get_gsc_data(
            site_url=site_url,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            dimensions=["page"],
            website_id=website_id,
        )

        for row in rows:
            keys = row.get("keys", [])
            if keys and keys[0] == url_record.url:
                clicks = row.get("clicks", 0)
                impressions = row.get("impressions", 0)
                ctr = row.get("ctr", 0.0)
                position = row.get("position", 0.0)

                # 检查今日快照是否已存在（避免重复）
                snap_stmt = select(PerformanceSnapshot).where(
                    PerformanceSnapshot.url_id == url_record.id,
                    PerformanceSnapshot.snapshot_date == end_date,
                )
                snap_result = await db.execute(snap_stmt)
                snapshot = snap_result.scalar_one_or_none()

                if snapshot is None:
                    prev_stmt = (
                        select(PerformanceSnapshot)
                        .where(PerformanceSnapshot.url_id == url_record.id)
                        .order_by(PerformanceSnapshot.snapshot_date.desc())
                        .limit(1)
                    )
                    prev_result = await db.execute(prev_stmt)
                    prev_snap = prev_result.scalar_one_or_none()

                    snapshot = PerformanceSnapshot(
                        url_id=url_record.id,
                        snapshot_date=end_date,
                        clicks=clicks,
                        impressions=impressions,
                        ctr=ctr * 100 if ctr <= 1 else ctr,
                        position=position,
                        previous_clicks=prev_snap.clicks if prev_snap else None,
                        previous_impressions=prev_snap.impressions if prev_snap else None,
                        previous_ctr=prev_snap.ctr if prev_snap else None,
                        previous_position=prev_snap.position if prev_snap else None,
                    )
                    db.add(snapshot)
                    await db.flush()

                return {"clicks": clicks, "impressions": impressions, "position": position}

        return {"message": "No GSC data found for this URL"}

    async def execute_batch_gsc_fetch(self, db: AsyncSession, website: Website) -> dict:
        if not website.gsc_site_url:
            return {"status": "skipped", "reason": "Website has no GSC property URL configured"}

        end_date = date.today() - timedelta(days=1)
        start_date = end_date - timedelta(days=3)

        has_quota = await quota_manager.consume_quota(db, "gsc")
        if not has_quota:
            return {"status": "skipped", "reason": "GSC quota exceeded"}

        try:
            rows = await google_api_client.get_gsc_data(
                site_url=website.gsc_site_url,
                start_date=start_date.isoformat(),
                end_date=end_date.isoformat(),
                dimensions=["page"],
                website_id=website.id,
            )
        except Exception as e:
            logger.error("Batch GSC fetch failed for website %s: %s", website.domain, e)
            return {"status": "error", "reason": str(e)}

        matched = 0
        for row in rows:
            keys = row.get("keys", [])
            if not keys:
                continue
            page_url = keys[0]

            url_stmt = select(URLRecord).where(URLRecord.url == page_url, URLRecord.website_id == website.id)
            url_result = await db.execute(url_stmt)
            url_record = url_result.scalar_one_or_none()

            if url_record is None:
                url_record = URLRecord(url=page_url, status="active", website_id=website.id)
                db.add(url_record)
                await db.flush()

            snap_stmt = select(PerformanceSnapshot).where(
                PerformanceSnapshot.url_id == url_record.id,
                PerformanceSnapshot.snapshot_date == end_date,
            )
            snap_result = await db.execute(snap_stmt)
            snapshot = snap_result.scalar_one_or_none()

            if snapshot is None:
                clicks = row.get("clicks", 0)
                impressions = row.get("impressions", 0)
                ctr = row.get("ctr", 0.0)
                position = row.get("position", 0.0)

                prev_stmt = (
                    select(PerformanceSnapshot)
                    .where(PerformanceSnapshot.url_id == url_record.id)
                    .order_by(PerformanceSnapshot.snapshot_date.desc())
                    .limit(1)
                )
                prev_result = await db.execute(prev_stmt)
                prev_snap = prev_result.scalar_one_or_none()

                snapshot = PerformanceSnapshot(
                    url_id=url_record.id,
                    snapshot_date=end_date,
                    clicks=clicks,
                    impressions=impressions,
                    ctr=ctr * 100 if ctr <= 1 else ctr,
                    position=position,
                    previous_clicks=prev_snap.clicks if prev_snap else None,
                    previous_impressions=prev_snap.impressions if prev_snap else None,
                    previous_ctr=prev_snap.ctr if prev_snap else None,
                    previous_position=prev_snap.position if prev_snap else None,
                )
                db.add(snapshot)
                matched += 1

        await db.flush()
        return {"status": "completed", "matched_urls": matched, "total_rows": len(rows)}

    async def _execute_inspection(self, db: AsyncSession, url_record: URLRecord) -> dict:
        if url_record.website and not url_record.website.gsc_site_url:
            return {"status": "skipped", "reason": "Website has no GSC property URL configured"}
        site_url = settings.GOOGLE_SITE_URL
        if url_record.website and url_record.website.gsc_site_url:
            site_url = url_record.website.gsc_site_url

        result = await google_api_client.inspect_url(
            site_url=site_url,
            inspection_url=url_record.url,
            website_id=url_record.website.id if url_record.website else None,
        )

        verdict = result.get("verdict", "").upper()
        if verdict in ("PASS", "NEUTRAL"):
            await tag_engine.apply_tag(db, url_record.id, "status", "Indexed")
            await tag_engine.remove_tag(db, url_record.id, "Excluded")
        elif "EXCLUDED" in result.get("coverage_state", "").upper():
            await tag_engine.apply_tag(db, url_record.id, "status", "Excluded")
            await tag_engine.remove_tag(db, url_record.id, "Indexed")

        return result

    async def _execute_indexing(self, url_record: URLRecord) -> dict:
        return await google_api_client.submit_for_indexing(
            url_record.url,
            website_id=url_record.website.id if url_record.website else None,
        )

    async def _execute_keyword_fetch(self, db: AsyncSession, url_record: URLRecord) -> dict:
        if not url_record.website or not url_record.website.gsc_site_url:
            return {"status": "skipped", "reason": "URL has no website GSC configuration"}

        end_date = date.today() - timedelta(days=2)
        start_date = end_date - timedelta(days=29)
        rows = await google_api_client.get_gsc_keyword_data(
            site_url=url_record.website.gsc_site_url,
            page_url=url_record.url,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            website_id=url_record.website.id,
        )

        imported = 0
        for row in rows:
            keys = row.get("keys", [])
            if len(keys) < 3:
                continue
            try:
                snapshot_date = date.fromisoformat(keys[0])
            except ValueError:
                continue
            keyword = keys[2]
            existing = (await db.execute(
                select(KeywordSnapshot).where(
                    KeywordSnapshot.url_id == url_record.id,
                    KeywordSnapshot.keyword == keyword,
                    KeywordSnapshot.snapshot_date == snapshot_date,
                )
            )).scalar_one_or_none()

            if existing:
                existing.clicks = row.get("clicks", 0)
                existing.impressions = row.get("impressions", 0)
                existing.ctr = round(row.get("ctr", 0.0), 4)
                existing.position = round(row.get("position", 0.0), 2)
            else:
                db.add(KeywordSnapshot(
                    url_id=url_record.id,
                    keyword=keyword,
                    snapshot_date=snapshot_date,
                    clicks=row.get("clicks", 0),
                    impressions=row.get("impressions", 0),
                    ctr=round(row.get("ctr", 0.0), 4),
                    position=round(row.get("position", 0.0), 2),
                ))
                imported += 1

        await db.flush()
        return {"status": "completed", "keywords_found": len(rows), "imported": imported}

    async def process_pending_tasks(self, db: AsyncSession, website_id: int | None = None) -> int:
        today = date.today()
        stmt = (
            select(TaskQueue)
            .where(
                TaskQueue.status == "pending",
                TaskQueue.scheduled_date <= today,
            )
            .order_by(TaskQueue.priority_score.desc())
        )

        if website_id:
            url_subq = select(URLRecord.id).where(URLRecord.website_id == website_id).subquery()
            stmt = stmt.where(TaskQueue.url_id.in_(select(url_subq.c.id)))

        result = await db.execute(stmt)
        tasks = result.scalars().all()

        processed = 0
        for task in tasks:
            api_type = TASK_TYPE_TO_API.get(task.task_type)
            if not api_type:
                continue

            remaining = await quota_manager.check_quota(db, api_type)
            if remaining <= 0:
                continue

            success = await self.execute_task(db, task)
            if success:
                processed += 1

        return processed

    async def defer_remaining_tasks(self, db: AsyncSession) -> int:
        return await quota_manager.defer_overquota_tasks(db)


task_scheduler = TaskScheduler()
