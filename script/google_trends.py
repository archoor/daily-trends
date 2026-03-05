import json
import os
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

import psycopg

from gemini_summarizer import summarize_text_with_gemini


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


_load_env_for_script()

from google_serpapi_client import (  # noqa: E402
    SerpApiError,
    fetch_google_trends_trending_now,
)


def _dt_to_iso(dt: datetime) -> str:
    dt = dt.astimezone(timezone.utc).replace(microsecond=0)
    return dt.isoformat().replace("+00:00", "Z")


def _slugify(value: str) -> str:
    value_norm = unicodedata.normalize("NFKD", value)
    value_ascii = value_norm.encode("ascii", "ignore").decode("ascii")
    value_ascii = re.sub(r"[^a-zA-Z0-9]+", "-", value_ascii)
    value_ascii = value_ascii.strip("-").lower()
    return value_ascii or "trend"


def _load_dotenv_from_project_root() -> None:
    """若 DATABASE_URL 未设置，从项目根目录的 .env 加载（便于在 script/ 下直接运行）。"""
    if os.getenv("DATABASE_URL"):
        return
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    env_path = os.path.join(project_root, ".env")
    if not os.path.isfile(env_path):
        return
    with open(env_path, encoding="utf-8") as f:
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


def _get_or_create_google_source_id(conn: "psycopg.Connection") -> str:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM data_source WHERE slug = %s", ("google",))
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
                "google",
                "Google Trends",
                "https://trends.google.com",
                True,
                now_iso,
                now_iso,
            ),
        )
        conn.commit()
        return source_id


def _map_trending_to_rows(
    source_id: str, items: List[Dict[str, Any]], snapshot_at: datetime
) -> List[tuple]:
    snapshot_iso = _dt_to_iso(snapshot_at)
    now_iso = snapshot_iso
    rows: List[tuple] = []

    for idx, item in enumerate(items, start=1):
        query: Optional[str] = item.get("query")
        if not query:
            continue

        external_id = query
        slug = _slugify(query)
        rank = idx
        name = query

        search_volume = item.get("search_volume")
        search_volume_display = (
            f"{search_volume:,}" if isinstance(search_volume, (int, float)) else None
        )

        growth_rate = item.get("increase_percentage")

        start_ts = item.get("start_timestamp")
        end_ts = item.get("end_timestamp")
        started_at_iso = (
            _dt_to_iso(datetime.fromtimestamp(start_ts, tz=timezone.utc))
            if isinstance(start_ts, (int, float))
            else None
        )
        ended_at_iso = (
            _dt_to_iso(datetime.fromtimestamp(end_ts, tz=timezone.utc))
            if isinstance(end_ts, (int, float))
            else None
        )

        is_active = bool(item.get("active", False))

        trend_breakdown = item.get("trend_breakdown")
        related_keywords = (
            json.dumps(trend_breakdown, ensure_ascii=False)
            if isinstance(trend_breakdown, list)
            else None
        )
        more_related_count = None

        row = (
            uuid4().hex,  # id
            source_id,
            external_id,
            slug,
            rank,
            name,
            int(search_volume) if isinstance(search_volume, (int, float)) else None,
            search_volume_display,
            float(growth_rate) if isinstance(growth_rate, (int, float)) else None,
            started_at_iso,
            ended_at_iso,
            is_active,
            related_keywords,
            more_related_count,
            snapshot_iso,
            now_iso,
            now_iso,
        )
        rows.append(row)

    return rows


def _build_google_page_context(items: List[Dict[str, Any]], geo: str, hours: int) -> str:
    """
    为 Google Trends 整页构造上下文文本，供 Gemini 生成页面级总结。
    """
    lines: List[str] = []
    total = len(items)
    lines.append(f"Source: Google Trends - trending searches for geo={geo}, window={hours} hours.")
    lines.append(f"Total trending topics on page: {total}.")
    lines.append(
        "Each line below contains: rank, query text, search volume, growth percentage, active/ended status, and related keywords."
    )

    for idx, item in enumerate(items[:100], start=1):
        query = item.get("query") or ""
        search_volume = item.get("search_volume")
        increase = item.get("increase_percentage")
        is_active = bool(item.get("active", False))
        breakdown = item.get("trend_breakdown") or []
        if isinstance(breakdown, list):
            keywords = ", ".join(str(k) for k in breakdown[:5])
        else:
            keywords = ""
        line = (
            f"#{idx} {query} | search_volume: {search_volume} | growth_percent: {increase} "
            f"| active: {is_active} | related_keywords: {keywords}"
        )
        lines.append(line)

    return "\n".join(lines)


def ingest_google_trends(
    *,
    geo: str = "US",
    hours: int = 24,
    category_id: Optional[int] = None,
    only_active: Optional[bool] = None,
    hl: str = "en",
) -> None:
    conn = _get_pg_conn_from_env()
    try:
        source_id = _get_or_create_google_source_id(conn)

        trending_items = fetch_google_trends_trending_now(
            geo=geo,
            hours=hours,
            category_id=category_id,
            only_active=only_active,
            hl=hl,
        )

        snapshot_at = datetime.now(timezone.utc)

        rows = _map_trending_to_rows(
            source_id, trending_items, snapshot_at
        )

        # 生成 Google Trends 整页中英文总结，写入 data_source.description / descriptionZh
        try:
            page_context = _build_google_page_context(trending_items, geo, hours)
            summary_en = summarize_text_with_gemini("google", page_context, lang="en")
            summary_zh = summarize_text_with_gemini("google", page_context, lang="zh")
            preview_source = summary_en or summary_zh
            if preview_source:
                print("[google_trends][gemini] full page summary preview:\n", preview_source.replace("\n", " ")[:200], "...")
        except Exception as e:
            print(f"[google_trends] 生成 Gemini 页面总结失败，将跳过本次总结：{e}")
            summary_en = None
            summary_zh = None

        with conn.cursor() as cur:
            cur.execute(
                'DELETE FROM google_trend_item WHERE "sourceId" = %s',
                (source_id,),
            )

            insert_sql = """
            INSERT INTO google_trend_item (
                id, "sourceId", "externalId", slug, rank, name,
                "searchVolume", "searchVolumeDisplay", "growthRate",
                "startedAt", "endedAt", "isActive", "relatedKeywords", "moreRelatedCount",
                "snapshotAt", "createdAt", "updatedAt"
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """

            cur.executemany(insert_sql, rows)
            if summary_en or summary_zh:
                now_iso = _dt_to_iso(datetime.now(timezone.utc))
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
        conn.commit()

        print(
            f"[google_trends] geo={geo} hours={hours} count={len(rows)} saved to Postgres"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        ingest_google_trends(
            geo=os.getenv("GOOGLE_TRENDS_GEO", "US"),
            hours=int(os.getenv("GOOGLE_TRENDS_HOURS", "24")),
            only_active=(
                os.getenv("GOOGLE_TRENDS_ONLY_ACTIVE", "true").lower() == "true"
            ),
        )
    except SerpApiError as e:
        print(f"[google_trends] SerpApiError: {e}")
        raise
    except Exception as e:
        print(f"[google_trends] Unexpected error: {e}")
        raise

