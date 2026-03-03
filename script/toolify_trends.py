"""
采集 Toolify AI 趋势榜单并写入数据库。
使用 toolify_firecrawl 抓取 https://www.toolify.ai/zh/Best-trending-AI-Tools，
解析后写入 toolify_trend_item 表；数据源 slug 为 'toolify'，与 config/sources.ts 一致。
"""
import os
import re
import sqlite3
from datetime import datetime, timezone
from typing import List, Dict, Tuple
from uuid import uuid4

from toolify_firecrawl import fetch_toolify_ai_trending_tools


PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))


def _dt_to_iso(dt: datetime) -> str:
    dt = dt.astimezone(timezone.utc).replace(microsecond=0)
    return dt.isoformat().replace("+00:00", "Z")


def _resolve_sqlite_path_from_env() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL 未配置，请在环境变量中设置。")

    if not url.startswith("file:"):
        raise RuntimeError("当前脚本仅支持 SQLite（DATABASE_URL 形如 file:./dev.db）。")

    path = url[len("file:") :]

    if path.startswith("./"):
        return os.path.join(PROJECT_ROOT, path[2:])

    return path


def _get_or_create_toolify_source_id(conn: sqlite3.Connection) -> str:
    """
    在 data_source 表中查找/创建 Toolify 的数据源记录。
    slug 约定为 'toolify'，与前端 config/sources.ts 一致。
    """
    cur = conn.cursor()
    cur.execute("SELECT id FROM data_source WHERE slug = ?", ("toolify",))
    row = cur.fetchone()
    if row:
        return row[0]

    source_id = uuid4().hex
    now_iso = _dt_to_iso(datetime.now(timezone.utc))

    cur.execute(
        """
        INSERT INTO data_source (id, slug, name, baseUrl, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            source_id,
            "toolify",
            "Toolify AI Tools",
            "https://www.toolify.ai",
            1,
            now_iso,
            now_iso,
        ),
    )
    conn.commit()
    return source_id


def _map_tools_to_rows(
    source_id: str, tools: List[Dict]
) -> List[Tuple]:
    """
    将采集结果映射为 toolify_trend_item 的插入行。
    monthlyVisits 存 BigInt，growthRate 存 Float（如 15.81 表示 15.81%）。
    """
    snapshot_at = datetime.now(timezone.utc)
    snapshot_iso = _dt_to_iso(snapshot_at)
    now_iso = snapshot_iso

    rows: List[Tuple] = []

    for item in tools:
        name = item.get("name")
        if not name:
            continue

        external_id = item.get("externalId") or item.get("slug") or ""
        if not external_id:
            external_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", name).strip("-").lower() or "tool"

        slug = item.get("slug") or external_id
        rank = item.get("rank")
        url = item.get("url")
        monthly_visits = item.get("monthlyVisits")  # int or None
        growth_display = item.get("growthDisplay")
        growth_rate = item.get("growthRate")  # float or None
        summary = item.get("summary")
        tags = item.get("tags")

        row: Tuple = (
            uuid4().hex,
            source_id,
            external_id,
            slug,
            rank,
            name,
            url,
            monthly_visits,
            growth_display,
            growth_rate,
            summary,
            tags,
            snapshot_iso,
            now_iso,
            now_iso,
        )
        rows.append(row)

    return rows


def ingest_toolify_trends() -> None:
    """
    主入口：
    1) 调用 toolify_firecrawl 抓取 Toolify AI 趋势页；
    2) 解析为结构化列表；
    3) 写入 SQLite 的 toolify_trend_item 表。

    策略：每次采集前清空本数据源的 toolify_trend_detail 与 toolify_trend_item，
    再插入本次抓取结果（全量覆盖）。
    """
    database_path = _resolve_sqlite_path_from_env()
    conn = sqlite3.connect(database_path)

    try:
        conn.execute("PRAGMA foreign_keys = ON;")

        source_id = _get_or_create_toolify_source_id(conn)

        tools = fetch_toolify_ai_trending_tools()
        if not tools:
            print("[toolify] 未解析到任何工具，跳过入库。")
            return

        rows = _map_tools_to_rows(source_id, tools)

        cur = conn.cursor()

        # 全量覆盖：先删详情表（避免外键约束），再清空本源的列表表
        cur.execute(
            """
            DELETE FROM toolify_trend_detail
            WHERE trendId IN (SELECT id FROM toolify_trend_item WHERE sourceId = ?)
            """,
            (source_id,),
        )
        cur.execute("DELETE FROM toolify_trend_item WHERE sourceId = ?", (source_id,))

        insert_sql = """
        INSERT INTO toolify_trend_item (
            id,
            sourceId,
            externalId,
            slug,
            rank,
            name,
            url,
            monthlyVisits,
            growthDisplay,
            growthRate,
            summary,
            tags,
            snapshotAt,
            createdAt,
            updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """

        cur.executemany(insert_sql, rows)
        conn.commit()

        print(
            f"[toolify] count={len(rows)} saved to {database_path} (sourceId={source_id})"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    ingest_toolify_trends()
