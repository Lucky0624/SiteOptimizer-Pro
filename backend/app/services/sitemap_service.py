"""
Sitemap 解析服务：支持标准 sitemap.xml 和 sitemap index 文件。
"""
import logging
import httpx
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

SITEMAP_NS = {
    "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
}


async def fetch_sitemap_urls(sitemap_url: str, max_urls: int = 5000) -> list[str]:
    """
    从 sitemap URL 解析所有页面 URL。
    支持 sitemap index（嵌套 sitemap 列表）和标准 urlset 两种格式。
    返回去重后的 URL 列表，最多返回 max_urls 条。
    """
    collected: list[str] = []

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        try:
            resp = await client.get(sitemap_url)
            resp.raise_for_status()
        except Exception as e:
            logger.error("Failed to fetch sitemap %s: %s", sitemap_url, e)
            raise ValueError(f"无法获取 Sitemap：{e}")

        content = resp.text
        try:
            root = ET.fromstring(content)
        except ET.ParseError as e:
            logger.error("Failed to parse sitemap XML from %s: %s", sitemap_url, e)
            raise ValueError(f"Sitemap XML 格式错误：{e}")

        tag = root.tag.lower()

        # Sitemap Index：包含多个子 sitemap 的索引文件
        if "sitemapindex" in tag:
            child_urls = [
                loc.text.strip()
                for sitemap_el in root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}sitemap")
                for loc in sitemap_el.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")
                if loc.text
            ]
            logger.info("Sitemap index found with %d child sitemaps", len(child_urls))
            for child_url in child_urls:
                if len(collected) >= max_urls:
                    break
                try:
                    child_resp = await client.get(child_url)
                    child_resp.raise_for_status()
                    child_root = ET.fromstring(child_resp.text)
                    _extract_urls(child_root, collected, max_urls)
                except Exception as e:
                    logger.warning("Failed to fetch child sitemap %s: %s", child_url, e)

        # 标准 urlset
        elif "urlset" in tag:
            _extract_urls(root, collected, max_urls)
        else:
            raise ValueError(f"未识别的 Sitemap 格式，根元素：{root.tag}")

    # 去重并保持顺序
    seen: set[str] = set()
    result: list[str] = []
    for url in collected:
        if url not in seen:
            seen.add(url)
            result.append(url)

    logger.info("Sitemap %s: parsed %d unique URLs", sitemap_url, len(result))
    return result[:max_urls]


def _extract_urls(root: ET.Element, collected: list[str], max_urls: int) -> None:
    """从 urlset 根元素提取所有 <loc> URL"""
    for url_el in root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url"):
        if len(collected) >= max_urls:
            break
        loc = url_el.find("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")
        if loc is not None and loc.text:
            collected.append(loc.text.strip())
