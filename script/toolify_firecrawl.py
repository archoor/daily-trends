"""
使用 Firecrawl 抓取 Toolify AI 趋势榜单页（Best-trending-AI-Tools），
解析 div.tTable 中的工具列表，与 product_hunt_firecrawl 采用相同的抓取方式。
"""
import os
import re
from typing import List, Dict, Any, Optional

import requests
from bs4 import BeautifulSoup


FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")
FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape"
TOOLIFY_TRENDING_URL = "https://www.toolify.ai/zh/Best-trending-AI-Tools"
TOOLIFY_BASE_URL = "https://www.toolify.ai"


class FirecrawlError(Exception):
    """Firecrawl 请求或返回异常。"""
    pass


def fetch_toolify_ai_html() -> str:
    """
    使用 Firecrawl 抓取 Toolify AI 趋势页原始 HTML。
    与 product_hunt_firecrawl 相同：仅普通抓取、rawHtml，不使用 actions。
    """
    if not FIRECRAWL_API_KEY:
        raise FirecrawlError("环境变量 FIRECRAWL_API_KEY 未设置")

    payload = {
        "url": TOOLIFY_TRENDING_URL,
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

    # 可选：将 HTML 落地到本地，便于调试
    try:
        debug_path = os.path.join(os.path.dirname(__file__), "toolify_ai_trending_debug.html")
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"[debug] 已将原始 HTML 写入 {debug_path}")
    except Exception as e:
        print(f"[debug] 写入调试 HTML 失败: {e}")

    return html


def _clean_text(text: Optional[str]) -> str:
    return " ".join((text or "").split()).strip()


def _parse_visits_to_int(value: str) -> Optional[int]:
    """
    将页面展示的访问量字符串转为整数，便于存入 monthlyVisits (BigInt)。
    例如: "314.0M" -> 314_000_000, "42.9M" -> 42_900_000, "1.2K" -> 1200。
    """
    if not value:
        return None
    value = _clean_text(value).upper().replace(",", "")
    mult = 1
    if value.endswith("M"):
        mult = 1_000_000
        value = value[:-1]
    elif value.endswith("K"):
        mult = 1_000
        value = value[:-1]
    elif value.endswith("B"):
        mult = 1_000_000_000
        value = value[:-1]
    try:
        return int(float(value) * mult)
    except (ValueError, TypeError):
        return None


def _parse_growth_rate(value: str) -> Optional[float]:
    """将增长率字符串如 '15.81%' 转为浮点数 15.81。"""
    if not value:
        return None
    value = _clean_text(value).replace("%", "")
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def parse_ai_tools_from_table(html: str) -> List[Dict[str, Any]]:
    """
    从页面 HTML 中解析 div.tTable 下的工具列表。
    每行为 tr.el-table__row，列顺序：排行图标 | 工具名+链接 | 月访问量 | 增长 | 增长率 | 介绍 | 标签。
    """
    soup = BeautifulSoup(html, "html.parser")

    # 结果列表在 div.tTable 中
    table_div = soup.find("div", class_="tTable")
    if not table_div:
        # 兼容：可能表格在 class 含 tTable 的容器内
        table_div = soup.find("div", class_=lambda c: c and "tTable" in (c if isinstance(c, str) else " ".join(c)))
    if not table_div:
        print("[toolify] 未找到 div.tTable，尝试在全页查找 tr.el-table__row")
        table_div = soup

    rows = table_div.find_all("tr", class_="el-table__row")
    tools: List[Dict[str, Any]] = []
    for rank, tr in enumerate(rows, start=1):
        tds = tr.find_all("td")
        if len(tds) < 7:
            continue

        # td[1]: 工具名与链接
        name = ""
        url = None
        external_id = ""
        cell1 = tds[1].find("div", class_="cell")
        if cell1:
            a = cell1.find("a", href=True)
            if a:
                name = _clean_text(a.get_text())
                href = (a.get("href") or "").strip()
                if href.startswith("/"):
                    url = TOOLIFY_BASE_URL + href
                else:
                    url = href if href.startswith("http") else None
                external_id = (a.get("data-handle") or "").strip() or (href.split("/")[-1] if href else "")

        if not name:
            continue

        if not external_id:
            external_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", name).strip("-").lower() or f"tool-{rank}"

        # td[2]: 月访问量，如 "314.0M"
        monthly_visits_text = _clean_text(tds[2].get_text())
        monthly_visits = _parse_visits_to_int(monthly_visits_text)

        # td[3]: 增长，如 "42.9M"（保留展示用）
        growth_display = _clean_text(tds[3].get_text())

        # td[4]: 增长率，如 "15.81%"
        growth_rate_text = _clean_text(tds[4].get_text())
        growth_rate = _parse_growth_rate(growth_rate_text)

        # td[5]: 介绍
        summary = ""
        cell5 = tds[5].find("p", class_="tool-desc") or tds[5].find("div", class_="cell")
        if cell5:
            summary = _clean_text(cell5.get_text())

        # td[6]: 标签
        tags = ""
        cell6 = tds[6].find("p", class_="tool-desc") or tds[6].find("div", class_="cell")
        if cell6:
            tags = _clean_text(cell6.get_text())

        tools.append({
            "rank": rank,
            "name": name,
            "url": url,
            "externalId": external_id,
            "slug": external_id,
            "monthlyVisits": monthly_visits,
            "monthlyVisitsDisplay": monthly_visits_text or None,
            "growthDisplay": growth_display or None,
            "growthRate": growth_rate,
            "summary": summary or None,
            "tags": tags or None,
        })
    return tools


def fetch_toolify_ai_trending_tools() -> List[Dict[str, Any]]:
    """
    对外主函数：抓取 Toolify AI 趋势页并解析为工具列表。
    仅负责采集与解析，不包含入库逻辑。
    """
    html = fetch_toolify_ai_html()
    return parse_ai_tools_from_table(html)
