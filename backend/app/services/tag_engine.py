from datetime import datetime, timezone, timedelta

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.url import URLRecord
from app.models.snapshot import Tag, PerformanceSnapshot


PERFORMANCE_TAGS = {"Decaying", "Opportunity", "High_Impression"}
STATUS_TAGS = {"Indexed", "Excluded", "Need_Recrawl"}


class TagEngine:
    async def analyze_and_tag(
        self,
        db: AsyncSession,
        url_record: URLRecord,
        current_snapshot: PerformanceSnapshot | None,
        previous_snapshot: PerformanceSnapshot | None,
    ) -> list[str]:
        applied_tags: list[str] = []

        if current_snapshot and previous_snapshot:
            if previous_snapshot.clicks > 0:
                drop_pct = (previous_snapshot.clicks - current_snapshot.clicks) / previous_snapshot.clicks * 100
                if drop_pct > 20:
                    await self.apply_tag(db, url_record.id, "performance", "Decaying")
                    applied_tags.append("Decaying")
                else:
                    await self.remove_tag(db, url_record.id, "Decaying")

        if current_snapshot:
            if current_snapshot.impressions > 500 and 11 <= current_snapshot.position <= 20:
                await self.apply_tag(db, url_record.id, "performance", "Opportunity")
                applied_tags.append("Opportunity")
            else:
                await self.remove_tag(db, url_record.id, "Opportunity")

            if current_snapshot.impressions > 1000 and current_snapshot.ctr < 2.0:
                await self.apply_tag(db, url_record.id, "performance", "High_Impression")
                applied_tags.append("High_Impression")
            else:
                await self.remove_tag(db, url_record.id, "High_Impression")

        if url_record.last_modified_at:
            two_days_ago = datetime.now(timezone.utc) - timedelta(days=2)
            # 修复P0：处理 naive datetime，添加 UTC 时区后再比较
            last_mod = url_record.last_modified_at
            if last_mod.tzinfo is None:
                last_mod = last_mod.replace(tzinfo=timezone.utc)
            if last_mod >= two_days_ago:
                await self.apply_tag(db, url_record.id, "status", "Need_Recrawl")
                applied_tags.append("Need_Recrawl")
            else:
                await self.remove_tag(db, url_record.id, "Need_Recrawl")

        return applied_tags

    async def cleanup_stale_tags(self, db: AsyncSession, url_record: URLRecord) -> int:
        removed = 0
        tag_names = {t.tag_name for t in url_record.tags}

        if "Decaying" in tag_names:
            snap_stmt = (
                select(PerformanceSnapshot)
                .where(PerformanceSnapshot.url_id == url_record.id)
                .order_by(PerformanceSnapshot.snapshot_date.desc())
                .limit(2)
            )
            snap_result = await db.execute(snap_stmt)
            snapshots = snap_result.scalars().all()
            if len(snapshots) >= 2 and snapshots[1].clicks > 0:
                drop_pct = (snapshots[1].clicks - snapshots[0].clicks) / snapshots[1].clicks * 100
                if drop_pct <= 20:
                    await self.remove_tag(db, url_record.id, "Decaying")
                    removed += 1

        if "Need_Recrawl" in tag_names and url_record.last_modified_at:
            two_days_ago = datetime.now(timezone.utc) - timedelta(days=2)
            last_mod = url_record.last_modified_at
            if last_mod.tzinfo is None:
                last_mod = last_mod.replace(tzinfo=timezone.utc)
            if last_mod < two_days_ago:
                await self.remove_tag(db, url_record.id, "Need_Recrawl")
                removed += 1

        return removed

    async def apply_tag(
        self, db: AsyncSession, url_id: int, tag_type: str, tag_name: str
    ) -> Tag:
        stmt = select(Tag).where(
            Tag.url_id == url_id,
            Tag.tag_name == tag_name,
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        tag = Tag(
            url_id=url_id,
            tag_type=tag_type,
            tag_name=tag_name,
            auto_applied=True,
        )
        db.add(tag)
        await db.flush()
        return tag

    async def remove_tag(self, db: AsyncSession, url_id: int, tag_name: str) -> bool:
        stmt = select(Tag).where(
            Tag.url_id == url_id,
            Tag.tag_name == tag_name,
        )
        result = await db.execute(stmt)
        tag = result.scalar_one_or_none()
        if tag:
            await db.delete(tag)
            await db.flush()
            return True
        return False

    async def get_urls_by_tag(
        self, db: AsyncSession, tag_name: str
    ) -> list[URLRecord]:
        stmt = (
            select(URLRecord)
            .join(Tag, Tag.url_id == URLRecord.id)
            .where(Tag.tag_name == tag_name, URLRecord.status == "active")
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())


tag_engine = TagEngine()
