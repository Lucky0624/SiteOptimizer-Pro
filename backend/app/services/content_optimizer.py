import re
from datetime import date, timedelta
from html import unescape
from urllib.parse import urlparse

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.keyword import KeywordSnapshot
from app.models.url import URLRecord


def _strip_html(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def _trim(value: str, limit: int) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    if len(value) <= limit:
        return value
    return value[: max(0, limit - 1)].rstrip(" ，,.-") + "…"


def _fallback_keyword(url_record: URLRecord, current_title: str | None) -> str:
    if current_title:
        title = re.sub(r"[-_|].*$", "", current_title).strip()
        if title:
            return _trim(title, 36)
    parts = [p for p in urlparse(url_record.url).path.strip("/").split("/") if p]
    if parts:
        return parts[-1].replace("-", " ").replace("_", " ").strip()[:36]
    return url_record.title or url_record.url


class ContentOptimizer:
    async def get_url_keywords(
        self,
        db: AsyncSession,
        url_id: int,
        days: int = 90,
        limit: int = 10,
    ) -> list[dict]:
        start_date = date.today() - timedelta(days=days)
        stmt = (
            select(
                KeywordSnapshot.keyword,
                func.sum(KeywordSnapshot.clicks).label("clicks"),
                func.sum(KeywordSnapshot.impressions).label("impressions"),
                func.avg(KeywordSnapshot.position).label("position"),
            )
            .where(
                KeywordSnapshot.url_id == url_id,
                KeywordSnapshot.snapshot_date >= start_date,
            )
            .group_by(KeywordSnapshot.keyword)
            .order_by(func.sum(KeywordSnapshot.impressions).desc())
            .limit(limit)
        )
        rows = (await db.execute(stmt)).all()
        return [
            {
                "keyword": row.keyword,
                "clicks": row.clicks or 0,
                "impressions": row.impressions or 0,
                "position": round(row.position or 0.0, 2),
            }
            for row in rows
        ]

    async def build_suggestion(
        self,
        db: AsyncSession,
        url_record: URLRecord,
        cms_content: dict,
    ) -> dict:
        keywords = await self.get_url_keywords(db, url_record.id)
        keyword_names = [k["keyword"] for k in keywords if k.get("keyword")]

        current_title = cms_content.get("title") or url_record.title or ""
        current_meta = cms_content.get("meta_description") or ""
        current_text = _strip_html(cms_content.get("content_text") or cms_content.get("content_html") or "")

        primary = keyword_names[0] if keyword_names else _fallback_keyword(url_record, current_title)
        supporting = keyword_names[1:6]

        haystack = f"{current_title} {current_meta} {current_text}".lower()
        missing = [kw for kw in keyword_names[:8] if kw.lower() not in haystack]

        base_title = current_title or primary
        if primary.lower() not in base_title.lower():
            suggested_title = f"{primary} | {base_title}"
        else:
            suggested_title = base_title

        suggested_title = _trim(suggested_title, 60)
        benefit_keywords = "、".join(missing[:3] or supporting[:3])
        if benefit_keywords:
            meta = f"了解 {primary} 的关键亮点、适用场景与优化建议，覆盖 {benefit_keywords} 等用户关注点。"
        else:
            meta = f"了解 {primary} 的关键亮点、适用场景与优化建议，快速判断这个页面是否符合你的需求。"

        suggested_meta = _trim(meta, 155)

        gap = "当前页面可加强这些搜索意图：" + "、".join(missing[:6]) if missing else "当前标题和描述已覆盖主要关键词，建议保持表达清晰并持续观察排名变化。"
        content_excerpt = _trim(
            f"{current_text[:220]} {gap}" if current_text else gap,
            320,
        )

        return {
            "suggested_title": suggested_title,
            "suggested_meta_description": suggested_meta,
            "suggested_content_excerpt": content_excerpt,
            "primary_keyword": primary,
            "supporting_keywords": supporting,
            "missing_keywords": missing,
            "content_gap_summary": gap,
        }


content_optimizer = ContentOptimizer()
