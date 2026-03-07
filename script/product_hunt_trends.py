import os
import re
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Tuple
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


# 先加载环境变量，再导入依赖 Firecrawl 的模块，保证 FIRECRAWL_API_KEY 等可用
_load_env_for_script()

from product_hunt_firecrawl import fetch_product_hunt_top_products_today  # noqa: E402


def _dt_to_iso(dt: datetime) -> str:
    dt = dt.astimezone(timezone.utc).replace(microsecond=0)
    return dt.isoformat().replace("+00:00", "Z")


def _get_pg_conn_from_env() -> "psycopg.Connection":
    """
    从环境变量 DATABASE_URL 获取 Postgres 连接。
    若未设置则尝试从项目根目录 .env 加载。
    例如：postgresql://user:pass@host:port/dbname
    """
    _load_env_for_script()
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL 未配置，请在环境变量中设置。")
    if not url.startswith("postgres"):
        raise RuntimeError("当前脚本已切换为 Postgres，仅支持 postgresql:// 开头的连接串。")
    return psycopg.connect(url)


def _get_or_create_product_hunt_source_id(conn: "psycopg.Connection") -> str:
    """
    在 data_source 表中查找/创建 Product Hunt 的数据源记录。
    slug 约定为 'producthunt'，与前端 config/sources.ts 一致。
    """
    with conn.cursor() as cur:
        # slug 需与前端 config/sources.ts 一致，为 "producthunt"（无连字符）
        cur.execute('SELECT id FROM data_source WHERE slug = %s', ("producthunt",))
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
                "producthunt",
                "Product Hunt",
                "https://www.producthunt.com",
                True,
                now_iso,
                now_iso,
            ),
        )
        conn.commit()
        return source_id


def _today_utc() -> datetime:
    """采集当天 0 点 UTC，用于 snapshotAt 与「仅删当天」逻辑。"""
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def _map_products_to_rows(
    source_id: str, products: List[Dict], snapshot_at: datetime
) -> List[Tuple]:
    """
    将采集结果映射为 product_hunt_trend_item 的插入行。
    """
    snapshot_iso = _dt_to_iso(snapshot_at)
    now_iso = snapshot_iso

    rows: List[Tuple] = []
    seen: set[Tuple[str, str]] = set()

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

        key = (external_id, snapshot_iso)
        if key in seen:
            # 同一 externalId + snapshotAt 已存在，跳过重复，避免唯一索引冲突
            continue
        seen.add(key)

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


def _build_product_hunt_page_context(products: List[Dict]) -> str:
    """
    为 Product Hunt 今日榜单构造整页上下文文本，供 Gemini 生成页面总结。
    """
    lines: List[str] = []
    total = len(products)
    lines.append("Source: Product Hunt - today's top products.")
    lines.append(f"Total products on page: {total}.")
    lines.append(
        "Each line below contains: rank, name, short description, categories, upvotes and comment count."
    )

    for item in products[:100]:
        rank = item.get("rank")
        name = item.get("name") or ""
        description = (item.get("description") or "").replace("\n", " ")
        categories = (item.get("categories") or "").replace("\n", " ")
        comments = item.get("commentCount")
        upvotes = item.get("upvoteCount")
        line = (
            f"#{rank or ''} {name} | desc: {description} | categories: {categories} "
            f"| upvotes: {upvotes} | comments: {comments}"
        )
        lines.append(line)

    return "\n".join(lines)


def ingest_product_hunt_today() -> None:
    """
    主入口：
    1) 调用 product_hunt_firecrawl 抓取 Product Hunt 首页今日产品列表；
    2) 解析为结构化列表；
    3) 写入 Postgres 的 product_hunt_trend_item 表。

    策略：仅覆盖「采集当天」的数据（先删当天 item + 关联 detail，再插入），保留历史日期。
    snapshotAt 使用当天 0 点 UTC。
    """
    conn = _get_pg_conn_from_env()

    try:
        source_id = _get_or_create_product_hunt_source_id(conn)

        products = fetch_product_hunt_top_products_today()
        if not products:
            print("[product_hunt] 未解析到任何产品，跳过入库。")
            return

        snapshot_at = _today_utc()
        rows = _map_products_to_rows(source_id, products, snapshot_at)

        # 生成 Product Hunt 今日榜单的整页中英文总结，写入 data_source.description / descriptionZh
        try:
            page_context = _build_product_hunt_page_context(products)
            summary_en = summarize_text_with_gemini("producthunt", page_context, lang="en")
            summary_zh = summarize_text_with_gemini("producthunt", page_context, lang="zh")
            preview_source = summary_en or summary_zh
            if preview_source:
                preview = preview_source.replace("\n", " ")[:200]
                print(f"[product_hunt][gemini] page summary preview: {preview}...")
        except Exception as e:
            print(f"[product_hunt] 生成 Gemini 页面总结失败，将跳过本次总结：{e}")
            summary_en = None
            summary_zh = None

        with conn.cursor() as cur:
            # 仅删除「采集当天」的列表与关联详情（用 UTC 时间范围，避免 DATE() 受会话时区影响）
            start_of_day = snapshot_at
            end_of_day = snapshot_at + timedelta(days=1)
            cur.execute(
                """
                DELETE FROM product_hunt_trend_detail
                WHERE "trendId" IN (
                    SELECT id FROM product_hunt_trend_item
                    WHERE "sourceId" = %s AND "snapshotAt" >= %s AND "snapshotAt" < %s
                )
                """,
                (source_id, start_of_day, end_of_day),
            )
            cur.execute(
                'DELETE FROM product_hunt_trend_item WHERE "sourceId" = %s AND "snapshotAt" >= %s AND "snapshotAt" < %s',
                (source_id, start_of_day, end_of_day),
            )

            insert_sql = """
            INSERT INTO product_hunt_trend_item (
                id, "sourceId", "externalId", slug, rank, name, description,
                "iconUrl", categories, "commentCount", "upvoteCount", url,
                "snapshotAt", "createdAt", "updatedAt"
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
            f"[product_hunt] count={len(rows)} saved to Postgres (sourceId={source_id})"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    ingest_product_hunt_today()

