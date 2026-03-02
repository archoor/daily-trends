import os
import re
import sqlite3
from datetime import datetime, timezone
from typing import List, Dict, Tuple
from uuid import uuid4

from product_hunt_firecrawl import fetch_product_hunt_top_products_today


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


def _get_or_create_product_hunt_source_id(conn: sqlite3.Connection) -> str:
    """
    在 data_source 表中查找/创建 Product Hunt 的数据源记录。
    slug 约定为 'producthunt'，与前端 config/sources.ts 一致。
    """
    cur = conn.cursor()
    # slug 需与前端 config/sources.ts 一致，为 "producthunt"（无连字符）
    cur.execute("SELECT id FROM data_source WHERE slug = ?", ("producthunt",))
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
            "producthunt",
            "Product Hunt",
            "https://www.producthunt.com",
            1,
            now_iso,
            now_iso,
        ),
    )
    conn.commit()
    return source_id


def _map_products_to_rows(
    source_id: str, products: List[Dict]
) -> List[Tuple]:
    """
    将采集结果映射为 product_hunt_trend_item 的插入行。
    """
    snapshot_at = datetime.now(timezone.utc)
    snapshot_iso = _dt_to_iso(snapshot_at)
    now_iso = snapshot_iso

    rows: List[Tuple] = []

    for item in products:
        name = item.get("name")
        url = item.get("url")
        if not name or not url:
            continue

        # externalId / slug 统一用产品 slug（从 URL 中截取最后一段）
        slug_match = re.search(r"/posts?/([^/?#]+)", url)
        if slug_match:
            slug = slug_match.group(1)
        else:
            # 兜底：用 name 做 slug（去空格、转小写）
            slug = re.sub(r"[^a-zA-Z0-9]+", "-", name).strip("-").lower() or "product"

        external_id = slug

        rank = item.get("rank")
        description = item.get("description") or None
        categories = item.get("categories") or None

        comment_count = item.get("commentCount")
        upvote_count = item.get("upvoteCount")

        try:
            comment_count_int = int(comment_count) if comment_count is not None else 0
        except (TypeError, ValueError):
            comment_count_int = 0

        try:
            upvote_count_int = int(upvote_count) if upvote_count is not None else 0
        except (TypeError, ValueError):
            upvote_count_int = 0

        row: Tuple = (
            uuid4().hex,  # id
            source_id,
            external_id,
            slug,
            rank,
            name,
            description,
            None,  # iconUrl 暂时不采，后续如有需要可从 DOM 中补
            categories,
            comment_count_int,
            upvote_count_int,
            url,
            snapshot_iso,
            now_iso,
            now_iso,
        )
        rows.append(row)

    return rows


def ingest_product_hunt_today() -> None:
    """
    主入口：
    1) 调用 product_hunt_firecrawl 抓取 Product Hunt 首页今日产品列表；
    2) 解析为结构化列表；
    3) 写入 SQLite 的 product_hunt_trend_item 表。

    当前策略：每次采集前清空 product_hunt_trend_detail 与 product_hunt_trend_item 表，
    再插入本次抓取结果（全量覆盖，不区分 sourceId）。
    """
    database_path = _resolve_sqlite_path_from_env()
    conn = sqlite3.connect(database_path)

    try:
        conn.execute("PRAGMA foreign_keys = ON;")

        source_id = _get_or_create_product_hunt_source_id(conn)

        products = fetch_product_hunt_top_products_today()
        if not products:
            print("[product_hunt] 未解析到任何产品，跳过入库。")
            return

        rows = _map_products_to_rows(source_id, products)

        cur = conn.cursor()

        # 全量覆盖：先删详情表（避免外键约束），再清空列表表
        cur.execute(
            "DELETE FROM product_hunt_trend_detail WHERE trendId IN (SELECT id FROM product_hunt_trend_item)"
        )
        cur.execute("DELETE FROM product_hunt_trend_item")

        insert_sql = """
        INSERT INTO product_hunt_trend_item (
            id,
            sourceId,
            externalId,
            slug,
            rank,
            name,
            description,
            iconUrl,
            categories,
            commentCount,
            upvoteCount,
            url,
            snapshotAt,
            createdAt,
            updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """

        cur.executemany(insert_sql, rows)
        conn.commit()

        print(
            f"[product_hunt] count={len(rows)} saved to {database_path} (sourceId={source_id})"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    ingest_product_hunt_today()

