from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.url import URLRecord
from app.models.snapshot import Tag, PerformanceSnapshot


class PriorityEngine:
    async def calculate_priority(
        self,
        url_record: URLRecord,
        latest_snapshot: PerformanceSnapshot | None,
        previous_snapshot: PerformanceSnapshot | None,
    ) -> float:
        score = 0.0

        tag_names: list[str] = [t.tag_name for t in url_record.tags]

        if "Need_Recrawl" in tag_names:
            score += 40.0

        if "Decaying" in tag_names:
            score += 30.0

        if "High_Impression" in tag_names:
            score += 20.0

        if "Opportunity" in tag_names:
            score += 15.0

        if "Excluded" in tag_names:
            score += 25.0

        if "Indexed" in tag_names:
            score -= 5.0

        if latest_snapshot and previous_snapshot:
            if previous_snapshot.clicks > 0:
                drop_pct = (previous_snapshot.clicks - latest_snapshot.clicks) / previous_snapshot.clicks * 100
                if drop_pct > 20:
                    score += 30.0

        # 修复：基于已抓取天数进行比例衰减，最多衰减 20 分，避免高分 URL 被大量误扣
        if url_record.last_crawled_at:
            last_crawled = url_record.last_crawled_at
            # 统一使用 UTC naive 比较，防止时区混淆
            now = datetime.utcnow()
            if last_crawled.tzinfo is not None:
                last_crawled = last_crawled.replace(tzinfo=None)
            days_since = max(0, (now - last_crawled).days)
            # 每过一天最多扣 1 分，上限 20 分（不能扣为负）
            decay_penalty = min(days_since * 1.0, 20.0)
            score = max(0.0, score - decay_penalty)

        return max(0.0, score)

    async def recalculate_all_priorities(self, db: AsyncSession, website_id: int | None = None) -> int:
        stmt = select(URLRecord).where(URLRecord.status == "active").options(selectinload(URLRecord.tags))
        if website_id:
            stmt = stmt.where(URLRecord.website_id == website_id)
        result = await db.execute(stmt)
        urls = result.scalars().all()

        updated = 0
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

            new_score = await self.calculate_priority(url_record, latest, previous)
            url_record.priority_score = new_score
            updated += 1

        await db.flush()
        return updated

    async def get_top_priority_urls(
        self, db: AsyncSession, limit: int = 50, task_type: str | None = None, website_id: int | None = None
    ) -> list[URLRecord]:
        stmt = (
            select(URLRecord)
            .where(URLRecord.status == "active")
            .options(selectinload(URLRecord.tags), selectinload(URLRecord.website))
            .order_by(URLRecord.priority_score.desc())
            .limit(limit)
        )
        if website_id:
            stmt = stmt.where(URLRecord.website_id == website_id)
        result = await db.execute(stmt)
        return list(result.scalars().all())


priority_engine = PriorityEngine()
