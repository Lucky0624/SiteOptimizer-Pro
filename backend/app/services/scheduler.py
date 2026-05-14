from datetime import date, datetime, timezone, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.website import Website
from app.models.url import URLRecord
from app.models.snapshot import PerformanceSnapshot
from app.models.task import TaskQueue
from app.services.google_api import google_api_client, GoogleAPIError, QuotaExceededError
from app.services.quota_manager import quota_manager, TASK_TYPE_TO_API
from app.services.priority_engine import priority_engine
from app.services.tag_engine import tag_engine
from app.config import settings


class TaskScheduler:
    async def schedule_daily_tasks(self, db: AsyncSession, website_id: int | None = None) -> int:
        today = date.today()
        top_urls = await priority_engine.get_top_priority_urls(db, limit=200, website_id=website_id)

        created = 0
        for url_record in top_urls:
            existing_stmt = select(TaskQueue).where(
                TaskQueue.url_id == url_record.id,
                TaskQueue.scheduled_date == today,
            )
            existing_result = await db.execute(existing_stmt)
            if existing_result.scalar_one_or_none():
                continue

            task_types: list[str] = []
            tag_names = [t.tag_name for t in url_record.tags]

            if "Excluded" in tag_names or "Need_Recrawl" in tag_names:
                task_types.append("inspection")
            if "Excluded" in tag_names:
                task_types.append("indexing")

            task_types.append("gsc_fetch")

            for task_type in task_types:
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

        url_record_stmt = select(URLRecord).where(URLRecord.id == task.url_id).options(selectinload(URLRecord.website))
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
                result = await self._execute_gsc_fetch(url_record)
            elif task.task_type == "inspection":
                result = await self._execute_inspection(db, url_record)
            elif task.task_type == "indexing":
                result = await self._execute_indexing(url_record)

            task.status = "completed"
            task.executed_at = datetime.now(timezone.utc)
            task.result_summary = str(result)
            url_record.last_crawled_at = datetime.now(timezone.utc)
            await db.flush()
            return True

        except QuotaExceededError as e:
            task.status = "deferred"
            task.error_message = str(e)
            await db.flush()
            return False

        except GoogleAPIError as e:
            task.retry_count += 1
            if task.retry_count >= task.max_retries:
                task.status = "failed"
            else:
                task.status = "pending"
            task.error_message = str(e)
            await db.flush()
            return False

        except Exception as e:
            task.retry_count += 1
            if task.retry_count >= task.max_retries:
                task.status = "failed"
            else:
                task.status = "pending"
            task.error_message = str(e)
            await db.flush()
            return False

    async def _execute_gsc_fetch(self, url_record: URLRecord) -> dict:
        end_date = date.today() - timedelta(days=1)
        start_date = end_date - timedelta(days=7)

        site_url = settings.GOOGLE_SITE_URL
        if url_record.website and url_record.website.gsc_site_url:
            site_url = url_record.website.gsc_site_url

        rows = await google_api_client.get_gsc_data(
            site_url=site_url,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            dimensions=["page"],
        )

        for row in rows:
            keys = row.get("keys", [])
            if keys and keys[0] == url_record.url:
                return row

        return {"message": "No data found for URL"}

    async def execute_batch_gsc_fetch(self, db: AsyncSession, website: Website) -> dict:
        end_date = date.today() - timedelta(days=1)
        start_date = end_date - timedelta(days=3)

        has_quota = await quota_manager.consume_quota(db, "gsc")
        if not has_quota:
            return {"status": "skipped", "reason": "GSC quota exceeded"}

        try:
            site_url = website.gsc_site_url or settings.GOOGLE_SITE_URL
            rows = await google_api_client.get_gsc_data(
                site_url=site_url,
                start_date=start_date.isoformat(),
                end_date=end_date.isoformat(),
                dimensions=["page"],
            )
        except Exception as e:
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
        site_url = settings.GOOGLE_SITE_URL
        if url_record.website and url_record.website.gsc_site_url:
            site_url = url_record.website.gsc_site_url

        result = await google_api_client.inspect_url(
            site_url=site_url,
            inspection_url=url_record.url,
        )

        verdict = result.get("verdict", "").upper()
        if verdict == "PASS" or verdict == "NEUTRAL":
            await tag_engine.apply_tag(db, url_record.id, "status", "Indexed")
            await tag_engine.remove_tag(db, url_record.id, "Excluded")
        elif "EXCLUDED" in result.get("coverage_state", "").upper():
            await tag_engine.apply_tag(db, url_record.id, "status", "Excluded")
            await tag_engine.remove_tag(db, url_record.id, "Indexed")

        return result

    async def _execute_indexing(self, url_record: URLRecord) -> dict:
        return await google_api_client.submit_for_indexing(url_record.url)

    async def process_pending_tasks(self, db: AsyncSession, website_id: int | None = None) -> int:
        today = date.today()
        stmt = (
            select(TaskQueue)
            .where(
                TaskQueue.status == "pending",
                TaskQueue.scheduled_date <= today,
                TaskQueue.task_type != "gsc_fetch",
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
