import json
import os
import re
import unicodedata
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from uuid import uuid4

import psycopg
import requests
from bs4 import BeautifulSoup

from gemini_summarizer import summarize_text_with_gemini


def _dt_to_iso(dt: datetime) -> str:
    dt = dt.astimezone(timezone.utc).replace(microsecond=0)
    return dt.isoformat().replace("+00:00", "Z")


def _slugify(value: str) -> str:
    value_norm = unicodedata.normalize("NFKD", value)
    value_ascii = value_norm.encode("ascii", "ignore").decode("ascii")
    value_ascii = re.sub(r"[^a-zA-Z0-9]+", "-", value_ascii)
    value_ascii = value_ascii.strip("-").lower()
    return value_ascii or "repo"


def _load_env_for_script() -> None:
    """
    加载采集脚本需要的环境变量：
    - 优先从 script 目录下的 .env 读取（FIRECRAWL_API_KEY、SERPAPI_API_KEY 等机密）
    - 再从项目根目录 .env 读取（如 DATABASE_URL），不会覆盖已存在的同名变量
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # 1) script/.env
    script_env = os.path.join(script_dir, ".env")
    if os.path.isfile(script_env):
        with open(script_env, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip("'\"").strip()
                if key and key not in os.environ:
                    os.environ[key] = value

    # 2) 项目根目录 .env（例如 DATABASE_URL），不覆盖前面已设置的变量
    project_root = os.path.dirname(script_dir)
    root_env = os.path.join(project_root, ".env")
    if os.path.isfile(root_env):
        with open(root_env, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip("'\"").strip()
                if key and key not in os.environ:
                    os.environ[key] = value


def _get_pg_conn_from_env() -> "psycopg.Connection":
    _load_env_for_script()
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL 未配置，请在环境变量中设置。")
    if not url.startswith("postgres"):
        raise RuntimeError("当前脚本已切换为 Postgres，仅支持 postgresql:// 开头的连接串。")
    return psycopg.connect(url)


def _get_or_create_github_source_id(conn: "psycopg.Connection") -> str:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM data_source WHERE slug = %s", ("github",))
        row = cur.fetchone()
        if row:
            return row[0]

        source_id = uuid4().hex
        now_iso = _dt_to_iso(datetime.now(timezone.utc))

        cur.execute(
            """
            INSERT INTO data_source (id, slug, name, "baseUrl", "isActive", "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                source_id,
                "github",
                "GitHub Trending",
                "https://github.com/trending",
                True,
                now_iso,
                now_iso,
            ),
        )
        conn.commit()
        return source_id


def _parse_int_from_text(text: str) -> int:
    text = text.strip()
    if not text:
        return 0
    text = text.replace(",", "").replace("+", "")
    m = re.search(r"(\d+)", text)
    return int(m.group(1)) if m else 0


def _fetch_github_trending(
    *, date_range: str = "today", language: Optional[str] = None, timeout: int = 20
) -> List[Dict[str, Any]]:
    """
    抓取 GitHub Trending Repositories 列表页并解析为结构化数据。

    参数：
    - date_range: "today" / "weekly" / "monthly"，对应 GitHub since=daily/weekly/monthly。
    - language: 可选，GitHub Trending 语言路径，如 "python"、"typescript"；None 表示全部语言。
    - timeout: HTTP 请求超时时间（秒）。
    """
    date_range = date_range.lower()
    date_range_to_since = {
        "today": "daily",
        "daily": "daily",
        "weekly": "weekly",
        "monthly": "monthly",
    }
    since = date_range_to_since.get(date_range, "daily")

    base_url = "https://github.com/trending"
    if language:
        base_url = f"{base_url}/{language}"

    params = {"since": since}
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }

    resp = requests.get(base_url, params=params, headers=headers, timeout=timeout)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    items: List[Dict[str, Any]] = []

    for rank, article in enumerate(soup.select("article.Box-row"), start=1):
        # 仓库名与链接
        h2 = article.find("h2")
        if not h2:
            continue
        a = h2.find("a")
        if not a or not a.get("href"):
            continue

        href = a["href"].strip()
        # href 形如 /owner/repo
        external_id = href.lstrip("/")
        repo_full_name = " ".join(a.get_text(strip=True).split())

        # 描述
        desc_tag = article.find("p")
        description = " ".join(desc_tag.get_text(strip=True).split()) if desc_tag else None

        # 语言
        lang_tag = article.find("span", attrs={"itemprop": "programmingLanguage"})
        language_name = lang_tag.get_text(strip=True) if lang_tag else None

        # 星标与 Fork
        stars = 0
        forks = 0
        # 1) 优先根据链接 href 判断 stargazers / forks / network 成员
        for link in article.find_all("a", href=True):
            href_val = link["href"]
            if href_val.endswith("/stargazers") or "/stargazers?" in href_val:
                stars = _parse_int_from_text(link.get_text())
            elif (
                "/network/members" in href_val
                or href_val.endswith("/forks")
                or "/forks?" in href_val
            ):
                forks = _parse_int_from_text(link.get_text())

        # 2) 若仍未识别到 Fork 数，尝试从整条卡片文本中模糊匹配 “123 forks”
        if forks == 0:
            full_text_for_forks = " ".join(article.stripped_strings)
            m_forks = re.search(
                r"(\d[\d,]*)\s+forks?",
                full_text_for_forks,
                flags=re.IGNORECASE,
            )
            if m_forks:
                forks = _parse_int_from_text(m_forks.group(1))

        # 今日/本周/本月新增星标
        stars_today = 0
        # 优先尝试按 span 文本精确匹配（兼容旧结构）
        stars_today_span = article.find(
            "span",
            string=re.compile(r"stars? (today|this week|this month)", re.IGNORECASE),
        )
        if stars_today_span:
            stars_today = _parse_int_from_text(stars_today_span.get_text())
        else:
            # 兼容 GitHub DOM 变更：从整条卡片文本中模糊匹配 “123 stars today/this week/this month”
            full_text = " ".join(article.stripped_strings)
            m = re.search(
                r"(\d[\d,]*)\s+stars?\s+(today|this week|this month)",
                full_text,
                flags=re.IGNORECASE,
            )
            if m:
                stars_today = _parse_int_from_text(m.group(1))

        # Built by 头像（仅保存头像 URL 列表）
        built_by_avatars: List[str] = []
        built_by_container = None
        for span in article.find_all("span"):
            text = span.get_text(strip=True)
            if text.startswith("Built by"):
                built_by_container = span
                break
        if built_by_container:
            for img in built_by_container.find_all("img", src=True):
                built_by_avatars.append(img["src"])

        items.append(
            {
                "rank": rank,
                "external_id": external_id,
                "repo_full_name": repo_full_name,
                "description": description,
                "language": language_name,
                "stars": stars,
                "forks": forks,
                "stars_today": stars_today,
                "date_range": date_range if date_range in {"today", "weekly", "monthly"} else "today",
                "built_by_avatars": built_by_avatars,
                "url": f"https://github.com/{external_id}",
            }
        )

    return items


def _map_trending_to_rows(
    source_id: str, items: List[Dict[str, Any]], snapshot_at: datetime
) -> List[tuple]:
    snapshot_iso = _dt_to_iso(snapshot_at)
    now_iso = snapshot_iso
    rows: List[tuple] = []

    for item in items:
        external_id = item["external_id"]
        slug = _slugify(external_id)

        row = (
            uuid4().hex,  # id
            source_id,
            external_id,
            slug,
            int(item.get("rank") or 0),
            item["repo_full_name"],
            item.get("description"),
            item.get("language"),
            int(item.get("stars") or 0),
            int(item.get("forks") or 0),
            int(item.get("stars_today") or 0),
            item.get("date_range"),
            json.dumps(item.get("built_by_avatars") or [], ensure_ascii=False)
            if item.get("built_by_avatars")
            else None,
            item.get("url"),
            snapshot_iso,
            now_iso,
            now_iso,
        )
        rows.append(row)

    return rows


def _build_github_page_context(items: List[Dict[str, Any]], date_range: str) -> str:
    """
    为 GitHub Trending 整页构造上下文文本，供 Gemini 做页面级总结。
    """
    lines: List[str] = []
    total = len(items)
    lines.append(f"Source: GitHub Trending repositories, date range: {date_range}.")
    lines.append(f"Total repositories on page: {total}.")
    lines.append(
        "Each line below contains: rank, repo full name, primary language, stars, forks, stars in this period, and short description."
    )

    for item in items[:100]:
        rank = item.get("rank")
        name = item.get("repo_full_name") or ""
        language = item.get("language") or ""
        stars = int(item.get("stars") or 0)
        forks = int(item.get("forks") or 0)
        stars_today = int(item.get("stars_today") or 0)
        desc = (item.get("description") or "").replace("\n", " ")
        line = (
            f"#{rank or ''} {name} | language: {language} | stars: {stars} | forks: {forks} "
            f"| stars_in_period: {stars_today} | description: {desc}"
        )
        lines.append(line)

    return "\n".join(lines)


def _today_utc() -> datetime:
    """采集当天 0 点 UTC，用于 snapshotAt 与「仅删当天」逻辑。"""
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def ingest_github_trends(
    *, date_range: str = "today", language: Optional[str] = None
) -> None:
    """
    抓取 GitHub Trending Repositories 并写入 github_trend_item 表（Postgres）。

    策略：仅覆盖「采集当天」的数据（DELETE 当天 + INSERT），保留历史日期数据。
    snapshotAt 使用当天 0 点 UTC。
    """
    conn = _get_pg_conn_from_env()
    try:
        source_id = _get_or_create_github_source_id(conn)

        trending_items = _fetch_github_trending(date_range=date_range, language=language)
        snapshot_at = _today_utc()
        rows = _map_trending_to_rows(source_id, trending_items, snapshot_at)

        # 生成本次 GitHub Trending 页的中英文整体总结，写入 data_source.description / descriptionZh
        try:
            page_context = _build_github_page_context(trending_items, date_range)
            summary_en = summarize_text_with_gemini("github", page_context, lang="en")
            summary_zh = summarize_text_with_gemini("github", page_context, lang="zh")
            preview_source = summary_en or summary_zh
            if preview_source:
                preview = preview_source.replace("\n", " ")
                print(f"[github_trends][gemini] page summary preview: {preview}...")
        except Exception as e:
            print(f"[github_trends] 生成 Gemini 页面总结失败，将跳过本次总结：{e}")
            summary_en = None
            summary_zh = None

        with conn.cursor() as cur:
            # 仅删除「采集当天」的旧数据（用 UTC 时间范围，避免 DATE() 受会话时区影响）
            start_of_day = snapshot_at
            end_of_day = snapshot_at + timedelta(days=1)
            cur.execute(
                'DELETE FROM github_trend_item WHERE "sourceId" = %s AND "snapshotAt" >= %s AND "snapshotAt" < %s',
                (source_id, start_of_day, end_of_day),
            )

            insert_sql = """
            INSERT INTO github_trend_item (
                id, "sourceId", "externalId", slug, rank, "repoFullName", description, language,
                stars, forks, "starsToday", "dateRange", "builtByJson", url,
                "snapshotAt", "createdAt", "updatedAt"
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """

            cur.executemany(insert_sql, rows)

            if summary_en or summary_zh:
                now_iso = _dt_to_iso(datetime.now(timezone.utc))
                today_ymd = snapshot_at.date().isoformat()
                cur.execute(
                    """
                    UPDATE data_source
                    SET description = %s,
                        "descriptionZh" = %s,
                        "updatedAt" = %s
                    WHERE id = %s
                    """,
                    (summary_en, summary_zh, now_iso, source_id),
                )
                cur.execute(
                    """
                    INSERT INTO source_daily_summary (id, "sourceId", "snapshotDate", description, "descriptionZh", "createdAt", "updatedAt")
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT ("sourceId", "snapshotDate") DO UPDATE SET
                        description = EXCLUDED.description,
                        "descriptionZh" = EXCLUDED."descriptionZh",
                        "updatedAt" = EXCLUDED."updatedAt"
                    """,
                    (uuid4().hex, source_id, today_ymd, summary_en, summary_zh, now_iso, now_iso),
                )
        conn.commit()

        print(
            f"[github_trends] date_range={date_range} language={language or 'all'} "
            f"count={len(rows)} saved to Postgres"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        ingest_github_trends(
            date_range=os.getenv("GITHUB_TRENDS_DATE_RANGE", "today"),
            language=os.getenv("GITHUB_TRENDS_LANGUAGE") or None,
        )
    except Exception as e:
        print(f"[github_trends] Unexpected error: {e}")
        raise

