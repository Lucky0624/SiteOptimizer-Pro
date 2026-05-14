import asyncio
from datetime import date, timedelta

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.website import Website
from app.models.url import URLRecord
from app.models.snapshot import Tag, PerformanceSnapshot
from app.services.google_api import google_api_client
from app.services.ga4_service import ga4_service
from app.services.tag_engine import tag_engine
from app.services.priority_engine import priority_engine
from app.services.quota_manager import quota_manager
from app.services.scheduler import task_scheduler
from app.config import settings


class SEOLoop:
    async def run_data_sync(self, db: AsyncSession, website: Website) -> dict:
        return await task_scheduler.execute_batch_gsc_fetch(db, website)

    async def run_tag_and_priority(self, db: AsyncSession, website: Website) -> dict:
        stmt = select(URLRecord).where(URLRecord.status == "active", URLRecord.website_id == website.id)
        result = await db.execute(stmt)
        urls = result.scalars().all()

        tagged = 0
        for url_record in urls:
            snap_stmt = (
                select(PerformanceSnapshot)
                .where(PerformanceSnapshot.url_id == url_record.id)
                .order_by(PerformanceSnapshot.snapshot_date.desc())
                .limit(2)
            )
            snap_result = await db.execute(snap_stmt)
            snapshots = snap_result.scalars().all()

            latest = snapshots[0] if len(snapshots) >= 1 else None
            previous = snapshots[1] if len(snapshots) >= 2 else None

            if latest:
                await tag_engine.analyze_and_tag(db, url_record, latest, previous)
                await tag_engine.cleanup_stale_tags(db, url_record)
                tagged += 1

        recalc_count = await priority_engine.recalculate_all_priorities(db, website_id=website.id)
        return {"tagged_urls": tagged, "recalculated_urls": recalc_count}

    async def run_task_allocation(self, db: AsyncSession, website: Website) -> dict:
        created = await task_scheduler.schedule_daily_tasks(db, website_id=website.id)
        processed = await task_scheduler.process_pending_tasks(db, website_id=website.id)
        deferred = await task_scheduler.defer_remaining_tasks(db)
        return {
            "tasks_created": created,
            "tasks_processed": processed,
            "tasks_deferred": deferred,
        }

    async def run_effect_retrospect(self, db: AsyncSession, website: Website | None = None) -> dict:
        today = date.today()
        seven_days_ago = today - timedelta(days=7)

        latest_snap_subq = (
            select(
                PerformanceSnapshot.url_id,
                PerformanceSnapshot.clicks,
                PerformanceSnapshot.previous_clicks,
                func.row_number()
                .over(partition_by=PerformanceSnapshot.url_id, order_by=PerformanceSnapshot.snapshot_date.desc())
                .label("rn"),
            )
            .where(PerformanceSnapshot.snapshot_date >= seven_days_ago)
        )

        if website:
            latest_snap_subq = latest_snap_subq.join(URLRecord, URLRecord.id == PerformanceSnapshot.url_id).where(URLRecord.website_id == website.id)

        latest_snap_subq = latest_snap_subq.subquery()

        stmt = select(latest_snap_subq).where(latest_snap_subq.c.rn == 1)
        result = await db.execute(stmt)
        rows = result.all()

        improved = 0
        declined = 0
        for row in rows:
            if row.previous_clicks is not None and row.previous_clicks > 0:
                change_pct = (row.clicks - row.previous_clicks) / row.previous_clicks * 100
                if change_pct > 10:
                    improved += 1
                elif change_pct < -10:
                    declined += 1

        return {
            "period_days": 7,
            "improved_urls": improved,
            "declined_urls": declined,
            "total_snapshots_analyzed": len(rows),
        }

    async def run_speed_check(self, db: AsyncSession, website: Website) -> dict:
        from app.services.psi_service import psi_service
        from app.utils.alert_utils import alert_manager

        stmt = (
            select(URLRecord)
            .where(URLRecord.status == "active", URLRecord.website_id == website.id)
            .order_by(URLRecord.priority_score.desc())
            .limit(5)
        )
        result = await db.execute(stmt)
        urls = result.scalars().all()

        checked = 0
        alerts_sent = 0
        for url_record in urls:
            try:
                res = await asyncio.wait_for(psi_service.get_page_speed_metrics(url_record.url), timeout=30.0)
            except asyncio.TimeoutError:
                continue
            except Exception:
                continue

            if "error" not in res:
                snap_stmt = (
                    select(PerformanceSnapshot)
                    .where(PerformanceSnapshot.url_id == url_record.id)
                    .order_by(PerformanceSnapshot.snapshot_date.desc())
                    .limit(1)
                )
                snap_result = await db.execute(snap_stmt)
                latest_snap = snap_result.scalar_one_or_none()

                if latest_snap:
                    latest_snap.lcp_value = res["lcp"]
                    latest_snap.cls_value = res["cls"]
                    latest_snap.fid_value = res["tbt"]
                    latest_snap.performance_score = res["performance_score"]

                    if res["lcp"] > settings.LCP_THRESHOLD_MS:
                        await alert_manager.broadcast_alert(
                            f"Page speed alert!\nURL: {url_record.url}\nLCP: {res['lcp']/1000:.2f}s (threshold: {settings.LCP_THRESHOLD_MS/1000:.2f}s)"
                        )
                        alerts_sent += 1
                checked += 1

        return {"urls_checked": checked, "alerts_sent": alerts_sent}

    async def run_ga4_sync(self, db: AsyncSession, website: Website) -> dict:
        property_id = website.ga4_property_id

        if not property_id:
            return {"status": "skipped", "reason": "GA4 Property ID not configured"}

        end_date = date.today() - timedelta(days=1)
        start_date = end_date - timedelta(days=3)

        try:
            report_data = await asyncio.wait_for(
                ga4_service.get_report(property_id, start_date.isoformat(), end_date.isoformat()),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            return {"status": "error", "reason": "GA4 sync timed out"}
        except Exception as e:
            return {"status": "error", "reason": str(e)}

        synced = 0
        for row in report_data:
            path = row["page_path"]
            url_stmt = select(URLRecord).where(URLRecord.website_id == website.id, URLRecord.url.like(f"%{path}"))
            url_res = await db.execute(url_stmt)
            url_record = url_res.scalar_one_or_none()

            if url_record:
                snap_stmt = (
                    select(PerformanceSnapshot)
                    .where(PerformanceSnapshot.url_id == url_record.id)
                    .order_by(PerformanceSnapshot.snapshot_date.desc())
                    .limit(1)
                )
                snap_res = await db.execute(snap_stmt)
                snapshot = snap_res.scalar_one_or_none()

                if snapshot:
                    snapshot.bounce_rate = row["bounce_rate"]
                    snapshot.conversions = row["conversions"]
                    synced += 1

        return {"status": "completed", "synced_rows": synced}

    async def _process_website(self, db: AsyncSession, website: Website) -> dict:
        try:
            sync_result = await asyncio.wait_for(self.run_data_sync(db, website), timeout=120.0)
        except asyncio.TimeoutError:
            sync_result = {"status": "error", "reason": "Data sync timed out"}
        except Exception as e:
            sync_result = {"status": "error", "reason": str(e)}

        try:
            ga4_result = await self.run_ga4_sync(db, website)
        except Exception as e:
            ga4_result = {"status": "error", "reason": str(e)}

        try:
            tag_result = await self.run_tag_and_priority(db, website)
        except Exception as e:
            tag_result = {"status": "error", "reason": str(e)}

        try:
            speed_result = await self.run_speed_check(db, website)
        except Exception as e:
            speed_result = {"status": "error", "reason": str(e)}

        try:
            alloc_result = await self.run_task_allocation(db, website)
        except Exception as e:
            alloc_result = {"status": "error", "reason": str(e)}

        try:
            retrospect_result = await self.run_effect_retrospect(db, website)
        except Exception as e:
            retrospect_result = {"status": "error", "reason": str(e)}

        return {
            "website": website.domain,
            "data_sync": sync_result,
            "ga4_sync": ga4_result,
            "tag_and_priority": tag_result,
            "speed_check": speed_result,
            "task_allocation": alloc_result,
            "effect_retrospect": retrospect_result,
        }

    async def run_full_cycle(self, db: AsyncSession) -> dict:
        stmt = select(Website).where(Website.is_active == True)
        result = await db.execute(stmt)
        websites = result.scalars().all()

        results = []
        for website in websites:
            website_result = await self._process_website(db, website)
            results.append(website_result)

        return {"status": "completed", "websites_processed": len(websites), "details": results}


seo_loop = SEOLoop()
