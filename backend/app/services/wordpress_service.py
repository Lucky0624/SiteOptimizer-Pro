"""
WordPress 集成服务：通过 WP REST API 同步文章/页面URL到 URLRecord
"""
import logging
import re
import httpx
from base64 import b64encode
from html import unescape
from urllib.parse import urlparse

from app.services.secret_storage import reveal_secret

logger = logging.getLogger(__name__)


class WordPressService:
    async def _get_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=30.0, follow_redirects=True)

    def _auth_header(self, username: str, app_password: str) -> dict:
        token = b64encode(f"{username}:{app_password}".encode()).decode()
        return {"Authorization": f"Basic {token}", "Content-Type": "application/json"}

    def _app_password(self, stored_password: str | None) -> str | None:
        return reveal_secret(stored_password) if stored_password else None

    def _api_base(self, wp_api_url: str) -> str:
        base = wp_api_url.strip().rstrip("/")
        # 如果用户填的是站点根目录，自动补全 /wp-json/wp/v2
        if not base.endswith("/wp/v2"):
            if base.endswith("/wp-json"):
                base = f"{base}/wp/v2"
            else:
                base = f"{base}/wp-json/wp/v2"
        return base

    def _strip_html(self, html: str | None) -> str:
        if not html:
            return ""
        text = re.sub(r"<[^>]+>", " ", html)
        return re.sub(r"\s+", " ", unescape(text)).strip()

    def _slug_from_url(self, page_url: str) -> str:
        parts = [p for p in urlparse(page_url).path.strip("/").split("/") if p]
        return parts[-1] if parts else ""

    async def _fetch_all(self, client: httpx.AsyncClient, url: str, headers: dict) -> list[dict]:
        """分页抓取全部记录（WP REST API 使用 page + per_page 分页）"""
        results = []
        page = 1
        per_page = 100
        while True:
            resp = await client.get(f"{url}&page={page}&per_page={per_page}", headers=headers)
            if resp.status_code == 400:
                break  # 超出最大页数
            if resp.status_code != 200:
                logger.error("WP API error %d at page %d: %s", resp.status_code, page, resp.text[:200])
                break
            data = resp.json()
            if not data:
                break
            results.extend(data)
            total_pages = int(resp.headers.get("X-WP-TotalPages", 1))
            if page >= total_pages:
                break
            page += 1
        return results

    async def sync_urls(self, website) -> list[str]:
        """
        同步 WordPress 站点所有已发布的文章和页面 URL
        """
        wp_url = website.wp_api_url
        username = website.wp_username
        app_password = self._app_password(website.wp_app_password)

        if not wp_url or not username or not app_password:
            logger.warning("WordPress not configured for website %s", website.domain)
            return []

        base = self._api_base(wp_url)
        headers = self._auth_header(username, app_password)
        urls: list[str] = []

        async with await self._get_client() as client:
            # 1. 文章（posts）
            try:
                posts = await self._fetch_all(client, f"{base}/posts?status=publish&_fields=link", headers)
                for post in posts:
                    if link := post.get("link"):
                        urls.append(link)
                logger.info("WP sync posts for %s: %d", website.domain, len(posts))
            except Exception as e:
                logger.error("Failed to fetch WP posts: %s", e)

            # 2. 页面（pages）
            try:
                pages = await self._fetch_all(client, f"{base}/pages?status=publish&_fields=link", headers)
                for page in pages:
                    if link := page.get("link"):
                        urls.append(link)
                logger.info("WP sync pages for %s: %d", website.domain, len(pages))
            except Exception as e:
                logger.error("Failed to fetch WP pages: %s", e)

            # 3. 自定义文章类型（CPT）
            try:
                # 获取所有非系统文章类型
                types_resp = await client.get(f"{base}/types?_fields=slug,rest_base", headers=headers)
                if types_resp.status_code == 200:
                    type_data = types_resp.json()
                    system_types = {"post", "page", "attachment", "wp_block", "wp_navigation", "wp_template", "wp_template_part"}
                    for slug, info in type_data.items():
                        if slug not in system_types:
                            rest_base = info.get("rest_base", slug)
                            try:
                                items = await self._fetch_all(
                                    client,
                                    f"{base}/{rest_base}?status=publish&_fields=link",
                                    headers,
                                )
                                for item in items:
                                    if link := item.get("link"):
                                        urls.append(link)
                            except Exception as e:
                                logger.warning("Failed to fetch CPT %s: %s", slug, e)
            except Exception as e:
                logger.warning("Failed to fetch WP custom post types: %s", e)

        logger.info("WordPress sync for %s: total %d URLs", website.domain, len(urls))
        return urls

    async def get_content_for_url(self, website, page_url: str) -> dict | None:
        wp_url = website.wp_api_url
        username = website.wp_username
        app_password = self._app_password(website.wp_app_password)
        if not wp_url or not username or not app_password:
            return None

        slug = self._slug_from_url(page_url)
        if not slug:
            return None

        base = self._api_base(wp_url)
        headers = self._auth_header(username, app_password)

        async with await self._get_client() as client:
            for endpoint in ("posts", "pages"):
                resp = await client.get(
                    f"{base}/{endpoint}?slug={slug}&_fields=id,slug,link,title,excerpt,content,type",
                    headers=headers,
                )
                if resp.status_code != 200:
                    continue
                items = resp.json()
                if not items:
                    continue
                item = items[0]
                title_html = (item.get("title") or {}).get("rendered", "")
                excerpt_html = (item.get("excerpt") or {}).get("rendered", "")
                content_html = (item.get("content") or {}).get("rendered", "")
                return {
                    "platform": "wordpress",
                    "resource_type": endpoint,
                    "resource_id": str(item.get("id")),
                    "resource_parent_id": None,
                    "url": item.get("link") or page_url,
                    "title": self._strip_html(title_html),
                    "admin_title": self._strip_html(title_html),
                    "meta_description": self._strip_html(excerpt_html)[:155],
                    "content_html": content_html,
                    "content_text": self._strip_html(content_html),
                }
        return None

    async def update_content(self, website, resource_type: str, resource_id: str, fields: dict, resource_parent_id: str | None = None) -> dict:
        wp_url = website.wp_api_url
        username = website.wp_username
        app_password = self._app_password(website.wp_app_password)
        if not wp_url or not username or not app_password:
            return {"ok": False, "error": "WordPress credentials are missing"}

        if resource_type not in ("posts", "pages"):
            return {"ok": False, "error": f"Unsupported WordPress resource type: {resource_type}"}

        payload: dict = {}
        if title := fields.get("title"):
            payload["title"] = title
        if meta := fields.get("meta_description"):
            payload["excerpt"] = meta
        if content := fields.get("content"):
            payload["content"] = content

        if not payload:
            return {"ok": False, "error": "No fields to update"}

        base = self._api_base(wp_url)
        headers = self._auth_header(username, app_password)
        try:
            async with await self._get_client() as client:
                resp = await client.post(f"{base}/{resource_type}/{resource_id}", headers=headers, json=payload)
                resp.raise_for_status()
                return {"ok": True, "resource_type": resource_type, "resource_id": resource_id}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    async def test_connection(self, wp_api_url: str, username: str, app_password: str) -> dict:
        """测试 WordPress REST API 连通性"""
        app_password = self._app_password(app_password) or ""
        base = self._api_base(wp_api_url)
        headers = self._auth_header(username, app_password)
        try:
            async with await self._get_client() as client:
                resp = await client.get(f"{base}/users/me", headers=headers)
                resp.raise_for_status()
                user = resp.json()
                return {"ok": True, "username": user.get("name", ""), "roles": user.get("roles", [])}
        except Exception as e:
            return {"ok": False, "error": str(e)}


wordpress_service = WordPressService()
