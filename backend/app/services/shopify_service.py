"""
Shopify 集成服务：通过 Shopify Admin REST API 同步站点页面/商品/博客URL到 URLRecord
"""
import logging
import re
import httpx
from html import unescape
from urllib.parse import urlparse

from app.services.secret_storage import reveal_secret

logger = logging.getLogger(__name__)

# Shopify API 版本
API_VERSION = "2024-01"


class ShopifyService:
    async def _get_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=30.0)

    def _base_url(self, shop_domain: str) -> str:
        domain = self._shop_domain(shop_domain)
        return f"https://{domain}/admin/api/{API_VERSION}"

    def _shop_domain(self, shop_domain: str) -> str:
        raw = shop_domain.strip().rstrip("/")
        parsed = urlparse(raw if raw.startswith(("http://", "https://")) else f"https://{raw}")
        return parsed.netloc or parsed.path

    def _public_base(self, shop_domain: str) -> str:
        return f"https://{self._shop_domain(shop_domain)}"

    def _strip_html(self, html: str | None) -> str:
        if not html:
            return ""
        text = re.sub(r"<[^>]+>", " ", html)
        return re.sub(r"\s+", " ", unescape(text)).strip()

    def _url_parts(self, page_url: str) -> list[str]:
        return [p for p in urlparse(page_url).path.strip("/").split("/") if p]

    def _access_token(self, stored_token: str | None) -> str | None:
        return reveal_secret(stored_token) if stored_token else None

    async def _paginate(self, client: httpx.AsyncClient, url: str, headers: dict, results: list) -> None:
        """Shopify 游标分页：自动遍历所有页"""
        while url:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                logger.error("Shopify API error %d: %s", resp.status_code, resp.text[:200])
                break
            data = resp.json()
            # 解析 Link header 获取下一页
            next_url = None
            link_header = resp.headers.get("Link", "")
            for part in link_header.split(","):
                part = part.strip()
                if 'rel="next"' in part:
                    next_url = part.split(";")[0].strip().strip("<>")
                    break
            yield data
            url = next_url

    async def sync_urls(self, website) -> list[str]:
        """
        同步 Shopify 店铺的所有可 SEO 优化的 URL：
        - 商品页 /products/{handle}
        - 集合页 /collections/{handle}
        - 独立页面 /pages/{handle}
        - 博客文章 /blogs/{blog_handle}/{article_handle}
        """
        token = self._access_token(website.shopify_access_token)
        shop_domain = website.domain

        if not token or not shop_domain:
            logger.warning("Shopify not configured for website %s", website.domain)
            return []

        base = self._base_url(shop_domain)
        headers = {
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
        }
        # 确定店铺基础 URL
        shop_base = self._public_base(shop_domain)

        urls: list[str] = []

        async with await self._get_client() as client:
            # 1. 商品页
            try:
                products_url = f"{base}/products.json?fields=handle&limit=250"
                async for data in self._paginate(client, products_url, headers, []):
                    for p in data.get("products", []):
                        urls.append(f"{shop_base}/products/{p['handle']}")
            except Exception as e:
                logger.error("Failed to fetch Shopify products: %s", e)

            # 2. 集合页
            try:
                colls_url = f"{base}/custom_collections.json?fields=handle&limit=250"
                async for data in self._paginate(client, colls_url, headers, []):
                    for c in data.get("custom_collections", []):
                        urls.append(f"{shop_base}/collections/{c['handle']}")
            except Exception as e:
                logger.error("Failed to fetch Shopify collections: %s", e)

            # 3. 独立页面
            try:
                pages_url = f"{base}/pages.json?fields=handle&limit=250"
                async for data in self._paginate(client, pages_url, headers, []):
                    for p in data.get("pages", []):
                        urls.append(f"{shop_base}/pages/{p['handle']}")
            except Exception as e:
                logger.error("Failed to fetch Shopify pages: %s", e)

            # 4. 博客文章
            try:
                blogs_url = f"{base}/blogs.json?fields=id,handle&limit=250"
                blogs_resp = await client.get(blogs_url, headers=headers)
                if blogs_resp.status_code == 200:
                    blogs = blogs_resp.json().get("blogs", [])
                    for blog in blogs:
                        articles_url = f"{base}/blogs/{blog['id']}/articles.json?fields=handle&limit=250"
                        async for data in self._paginate(client, articles_url, headers, []):
                            for a in data.get("articles", []):
                                urls.append(f"{shop_base}/blogs/{blog['handle']}/{a['handle']}")
            except Exception as e:
                logger.error("Failed to fetch Shopify blog articles: %s", e)

        logger.info("Shopify sync for %s: found %d URLs", shop_domain, len(urls))
        return urls

    async def get_content_for_url(self, website, page_url: str) -> dict | None:
        token = self._access_token(website.shopify_access_token)
        if not token:
            return None

        base = self._base_url(website.domain)
        headers = {"X-Shopify-Access-Token": token, "Content-Type": "application/json"}
        parts = self._url_parts(page_url)
        if len(parts) < 2:
            return None

        async with await self._get_client() as client:
            resource_type = parts[0]
            handle = parts[-1]

            if resource_type == "products":
                resp = await client.get(
                    f"{base}/products.json?handle={handle}&fields=id,handle,title,body_html,metafields_global_title_tag,metafields_global_description_tag",
                    headers=headers,
                )
                items = resp.json().get("products", []) if resp.status_code == 200 else []
                if not items:
                    return None
                item = items[0]
                return self._content_response("shopify", "product", item, page_url)

            if resource_type == "collections":
                for endpoint, response_key, type_name in (
                    ("custom_collections", "custom_collections", "custom_collection"),
                    ("smart_collections", "smart_collections", "smart_collection"),
                ):
                    resp = await client.get(
                        f"{base}/{endpoint}.json?handle={handle}&fields=id,handle,title,body_html,metafields_global_title_tag,metafields_global_description_tag",
                        headers=headers,
                    )
                    items = resp.json().get(response_key, []) if resp.status_code == 200 else []
                    if items:
                        return self._content_response("shopify", type_name, items[0], page_url)

            if resource_type == "pages":
                resp = await client.get(
                    f"{base}/pages.json?handle={handle}&fields=id,handle,title,body_html,metafields_global_title_tag,metafields_global_description_tag",
                    headers=headers,
                )
                items = resp.json().get("pages", []) if resp.status_code == 200 else []
                if not items:
                    return None
                return self._content_response("shopify", "page", items[0], page_url)

            if resource_type == "blogs" and len(parts) >= 3:
                blog_handle = parts[1]
                article_handle = parts[2]
                blog_resp = await client.get(
                    f"{base}/blogs.json?handle={blog_handle}&fields=id,handle",
                    headers=headers,
                )
                blogs = blog_resp.json().get("blogs", []) if blog_resp.status_code == 200 else []
                if not blogs:
                    return None
                blog_id = blogs[0]["id"]
                article_resp = await client.get(
                    f"{base}/blogs/{blog_id}/articles.json?handle={article_handle}&fields=id,handle,title,body_html,metafields_global_title_tag,metafields_global_description_tag",
                    headers=headers,
                )
                articles = article_resp.json().get("articles", []) if article_resp.status_code == 200 else []
                if not articles:
                    return None
                out = self._content_response("shopify", "article", articles[0], page_url)
                out["resource_parent_id"] = str(blog_id)
                return out

        return None

    def _content_response(self, platform: str, resource_type: str, item: dict, page_url: str) -> dict:
        body = item.get("body_html") or ""
        meta = item.get("metafields_global_description_tag") or self._strip_html(body)[:155]
        return {
            "platform": platform,
            "resource_type": resource_type,
            "resource_id": str(item.get("id")),
            "resource_parent_id": None,
            "url": page_url,
            "title": item.get("metafields_global_title_tag") or item.get("title") or "",
            "admin_title": item.get("title") or "",
            "meta_description": meta,
            "content_html": body,
            "content_text": self._strip_html(body),
        }

    async def update_content(self, website, resource_type: str, resource_id: str, fields: dict, resource_parent_id: str | None = None) -> dict:
        token = self._access_token(website.shopify_access_token)
        if not token:
            return {"ok": False, "error": "Shopify access token is missing"}

        endpoint_map = {
            "product": ("products", "product"),
            "page": ("pages", "page"),
            "custom_collection": ("custom_collections", "custom_collection"),
            "smart_collection": ("smart_collections", "smart_collection"),
        }

        base = self._base_url(website.domain)
        headers = {"X-Shopify-Access-Token": token, "Content-Type": "application/json"}
        payload_fields: dict = {"id": int(resource_id)}

        if title := fields.get("title"):
            payload_fields["metafields_global_title_tag"] = title
        if meta := fields.get("meta_description"):
            payload_fields["metafields_global_description_tag"] = meta
        if body_html := fields.get("body_html"):
            payload_fields["body_html"] = body_html

        if resource_type == "article":
            if not resource_parent_id:
                return {"ok": False, "error": "Shopify article is missing blog id"}
            url = f"{base}/blogs/{resource_parent_id}/articles/{resource_id}.json"
            payload = {"article": payload_fields}
        elif resource_type in endpoint_map:
            endpoint, key = endpoint_map[resource_type]
            url = f"{base}/{endpoint}/{resource_id}.json"
            payload = {key: payload_fields}
        else:
            return {"ok": False, "error": f"Unsupported Shopify resource type: {resource_type}"}

        try:
            async with await self._get_client() as client:
                resp = await client.put(url, headers=headers, json=payload)
                resp.raise_for_status()
                return {"ok": True, "resource_type": resource_type, "resource_id": resource_id}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    async def test_connection(self, shop_domain: str, access_token: str) -> dict:
        """测试 Shopify API 连通性"""
        access_token = self._access_token(access_token) or ""
        base = self._base_url(shop_domain)
        headers = {"X-Shopify-Access-Token": access_token}
        try:
            async with await self._get_client() as client:
                resp = await client.get(f"{base}/shop.json", headers=headers)
                resp.raise_for_status()
                shop = resp.json().get("shop", {})
                return {"ok": True, "shop_name": shop.get("name", ""), "plan": shop.get("plan_name", "")}
        except Exception as e:
            return {"ok": False, "error": str(e)}


shopify_service = ShopifyService()
