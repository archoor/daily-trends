import json
import os
import re
from typing import List, Dict, Any

import requests
from bs4 import BeautifulSoup


FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")
FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape"
# 直接抓取 Product Hunt 首页今日产品列表，有啥采啥；
# 不使用 actions，避免在部分地区因 Firecrawl 禁止 actions 导致 403。
PRODUCT_HUNT_URL = "https://www.producthunt.com/"


class FirecrawlError(Exception):
    pass


def fetch_product_hunt_html() -> str:
    if not FIRECRAWL_API_KEY:
        raise FirecrawlError("环境变量 FIRECRAWL_API_KEY 未设置")

    # 不使用 actions，仅普通抓取，兼容 Firecrawl 在部分地区对 actions/headers 的限制
    payload = {
        "url": PRODUCT_HUNT_URL,
        # 使用 rawHtml，避免清洗/裁剪掉首页产品列表
        "formats": ["rawHtml"],
        "onlyMainContent": False,
        "skipTlsVerification": True,
        "proxy": "auto",
    }

    headers = {
        "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
        "Content-Type": "application/json",
    }

    resp = requests.post(FIRECRAWL_SCRAPE_URL, json=payload, headers=headers, timeout=120)
    if resp.status_code != 200:
        raise FirecrawlError(f"Firecrawl HTTP {resp.status_code}: {resp.text}")

    data = resp.json()
    if not data.get("success"):
        raise FirecrawlError(f"Firecrawl 返回失败: {data}")

    html = data.get("data", {}).get("rawHtml") or data.get("data", {}).get("html")
    if not html:
        raise FirecrawlError("Firecrawl 返回中没有 html/rawHtml 数据")

    # 可选：将 HTML 落地到本地文件，方便你用浏览器打开查看真实结构
    try:
        debug_path = os.path.join(os.path.dirname(__file__), "product_hunt_home_debug.html")
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"[debug] 已将原始 HTML 写入 {debug_path}")
    except Exception as e:
        print(f"[debug] 写入调试 HTML 失败: {e}")

    return html


def _clean_text(text: str) -> str:
    return " ".join(text.split()) if text else ""


def _extract_posts_from_apollo_payload(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    从 Apollo SSR 的 JSON payload 中递归提取 __typename == "Post" 的节点。
    """
    posts: List[Dict[str, Any]] = []

    def _walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("__typename") == "Post":
                posts.append(node)
            for v in node.values():
                _walk(v)
        elif isinstance(node, list):
            for item in node:
                _walk(item)

    _walk(payload)
    return posts


def parse_top_products_launching_today(html: str) -> List[Dict]:
    """
    优先从内联的 ApolloSSRDataTransport JSON 中解析 Post 列表（包含今日产品）；
    若解析失败再退回到 DOM 解析（理论上抓到的 HTML 里产品 DOM 很少）。
    """
    # 1) 从 (window[Symbol.for("ApolloSSRDataTransport")] ??= []).push({...}) 中提取 JSON
    matches = re.finditer(
        r"\.push\((\{.*?\})\);",
        html,
        re.DOTALL,
    )

    apollo_posts: List[Dict[str, Any]] = []

    for m in matches:
        body = m.group(1)
        # 只处理包含 Homefeed 的 payload，避免其他无关数据
        if "HomefeedConnectionCustom" not in body and "HomefeedPage" not in body:
            continue
        try:
            payload = json.loads(body)
        except Exception:
            continue

        posts = _extract_posts_from_apollo_payload(payload)
        if posts:
            apollo_posts.extend(posts)

    # 如果通过 Apollo 数据拿到了 Post，就直接用这些；有啥采啥
    if apollo_posts:
        products: List[Dict] = []
        seen_slugs = set()

        for idx, post in enumerate(apollo_posts, start=1):
            slug = post.get("slug")
            if slug and slug in seen_slugs:
                continue
            if slug:
                seen_slugs.add(slug)

            name = post.get("name") or ""
            description = (
                post.get("tagline")
                or post.get("description")
                or post.get("subtitle")
                or ""
            )
            comments = (
                post.get("commentsCount")
                or (post.get("comments") or {}).get("totalCount")
            )
            upvotes = (
                post.get("votesCount")
                or (post.get("votes") or {}).get("totalCount")
            )

            url = f"https://www.producthunt.com/posts/{slug}" if slug else None

            products.append(
                {
                    "rank": idx,
                    "name": name,
                    "description": description,
                    "categories": "",  # Apollo 数据里如有分类字段，可后续补充
                    "commentCount": comments,
                    "upvoteCount": upvotes,
                    "url": url,
                }
            )

        return products

    # 2) 退回 DOM 解析：从 homepage-section-today 容器里按 section[data-test^="post-item-"] 有啥采啥
    soup = BeautifulSoup(html, "html.parser")
    container = soup.find("div", attrs={"data-test": "homepage-section-today"}) or soup

    products: List[Dict] = []
    rank = 0

    sections = container.find_all(
        "section", attrs={"data-test": re.compile(r"^post-item-")}
    )

    for sec in sections:
        # 名称 & 链接
        name = ""
        url = None
        name_span = sec.find("span", attrs={"data-test": re.compile(r"^post-name-")})
        if name_span:
            a = name_span.find("a", href=True)
            if a:
                raw_name = _clean_text(a.get_text(" ", strip=True))
                # 去掉前缀序号，如 "3. OpenFang" -> "OpenFang"
                m = re.match(r"^\d+\.\s*(.+)$", raw_name)
                name = m.group(1) if m else raw_name
                href = a["href"]
                url = (
                    f"https://www.producthunt.com{href}" if href.startswith("/") else href
                )

        if not name or not url:
            continue

        # 描述：紧跟在名称后面的灰色文案
        desc_span = sec.find(
            "span",
            class_=lambda c: c and "text-secondary" in c,
        )
        description = (
            _clean_text(desc_span.get_text(" ", strip=True)) if desc_span else ""
        )

        # 类别：section 内所有 /topics/ 链接
        topic_links = sec.select('div.flex.flex-row.flex-wrap a[href^="/topics/"]')
        categories = (
            " • ".join(
                _clean_text(link.get_text(" ", strip=True)) for link in topic_links
            )
            if topic_links
            else ""
        )

        # 点赞数：vote-button 中的小数字
        upvotes = None
        vote_btn = sec.find("button", attrs={"data-test": "vote-button"})
        if vote_btn:
            p = vote_btn.find("p")
            if p:
                try:
                    upvotes = int(_clean_text(p.get_text()))
                except ValueError:
                    upvotes = None

        # 评论数：列表页上不明显展示，先留空
        comments = None

        rank += 1
        products.append(
            {
                "rank": rank,
                "name": name,
                "description": description,
                "categories": categories,
                "commentCount": comments,
                "upvoteCount": upvotes,
                "url": url,
            }
        )

    return products


def fetch_product_hunt_top_products_today() -> List[Dict]:
    """
    对外主函数：返回 Top products launching today 的产品列表。
    仅负责采集与解析，不包含入库逻辑。
    """
    html = fetch_product_hunt_html()
    products = parse_top_products_launching_today(html)
    return products