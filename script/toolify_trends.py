"""
采集 Toolify AI 趋势榜单并写入数据库。
使用 toolify_firecrawl 抓取 https://www.toolify.ai/zh/Best-trending-AI-Tools，
解析后写入 toolify_trend_item 表；数据源 slug 为 'toolify'，与 config/sources.ts 一致。

（已升级为写入 Postgres，使用 DATABASE_URL=postgresql://...）
"""
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


_load_env_for_script()

from toolify_firecrawl import fetch_toolify_ai_trending_tools  # noqa: E402


def _dt_to_iso(dt: datetime) -> str:
    dt = dt.astimezone(timezone.utc).replace(microsecond=0)
    return dt.isoformat().replace("+00:00", "Z")


def _get_pg_conn_from_env() -> "psycopg.Connection":
    """
    从环境变量 DATABASE_URL 获取 Postgres 连接。
    环境变量优先来自 script/.env，其次项目根 .env。
    例如：postgresql://user:pass@host:port/dbname
    """
    _load_env_for_script()
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL 未配置，请在环境变量中设置。")
    if not url.startswith("postgres"):
        raise RuntimeError("当前脚本已切换为 Postgres，仅支持 postgresql:// 开头的连接串。")
    return psycopg.connect(url)


def _get_or_create_toolify_source_id(conn: "psycopg.Connection") -> str:
    """
    在 data_source 表中查找/创建 Toolify 的数据源记录。
    slug 约定为 'toolify'，与前端 config/sources.ts 一致。
    """
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM data_source WHERE slug = %s", ("toolify",))
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
                "toolify",
                "Toolify AI Tools",
                "https://www.toolify.ai",
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


def _map_tools_to_rows(
    source_id: str, tools: List[Dict], snapshot_at: datetime
) -> List[Tuple]:
    """
    将采集结果映射为 toolify_trend_item 的插入行。
    monthlyVisits 存 BigInt，growthRate 存 Float（如 15.81 表示 15.81%）。
    """
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


def _build_toolify_page_context(tools: List[Dict]) -> str:
    """
    为整页趋势列表构造上下文文本，交给 Gemini 生成页面级总结。
    这里不做复杂分析，只提供结构化信息，具体洞察由模型结合提示词完成。
    """
    lines: List[str] = []
    total = len(tools)
    lines.append(f"Source: Toolify AI trending tools page.")
    lines.append(f"Total tools on page: {total}.")
    lines.append(
        "Each line below contains: rank, name, monthly visits display, growth display, growth rate, categories/tags, short description."
    )

    for item in tools[:100]:
        name = item.get("name") or ""
        rank = item.get("rank")
        monthly_display = item.get("monthlyVisitsDisplay") or ""
        growth_display = item.get("growthDisplay") or ""
        growth_rate = item.get("growthRate")
        summary = (item.get("summary") or "").replace("\n", " ")
        tags = (item.get("tags") or "").replace("\n", " ")
        line = (
            f"#{rank or ''} {name} | visits: {monthly_display} | growth: {growth_display} "
            f"| growth_rate: {growth_rate if growth_rate is not None else ''} | tags: {tags} | summary: {summary}"
        )
        lines.append(line)

    return "\n".join(lines)


def ingest_toolify_trends() -> None:
    """
    主入口：
    1) 调用 toolify_firecrawl 抓取 Toolify AI 趋势页；
    2) 解析为结构化列表；
    3) 写入 Postgres 的 toolify_trend_item 表。

    策略：仅覆盖「采集当天」的数据（先删当天 trend_item + 关联 detail，再插入），保留历史日期。
    snapshotAt 使用当天 0 点 UTC。
    """
    conn = _get_pg_conn_from_env()

    try:
        source_id = _get_or_create_toolify_source_id(conn)

        tools = fetch_toolify_ai_trending_tools()
        if not tools:
            print("[toolify] 未解析到任何工具，跳过入库。")
            return

        # 只保留前 50 个工具，避免一次采集过多条目
        tools = tools[:50]

        snapshot_at = _today_utc()
        rows = _map_tools_to_rows(source_id, tools, snapshot_at)

        # 为当前数据源生成整页级别的中英文总结，写入 data_source.description / descriptionZh
        try:
            page_context = _build_toolify_page_context(tools)
            summary_en = summarize_text_with_gemini("toolify", page_context, lang="en")
            summary_zh = summarize_text_with_gemini("toolify", page_context, lang="zh")
            preview_source = summary_en or summary_zh
            if preview_source:
                preview = preview_source.replace("\n", " ")[:200]
                print(f"[toolify][gemini] page summary preview: {preview}...")
        except Exception as e:
            print(f"[toolify] 生成 Gemini 页面总结失败，将跳过本次总结：{e}")
            summary_en = None
            summary_zh = None

        with conn.cursor() as cur:
            # 仅删除「采集当天」的列表与关联详情（用 UTC 时间范围，避免 DATE() 受会话时区影响）
            start_of_day = snapshot_at
            end_of_day = snapshot_at + timedelta(days=1)
            cur.execute(
                """
                DELETE FROM toolify_trend_detail
                WHERE "trendId" IN (
                    SELECT id FROM toolify_trend_item
                    WHERE "sourceId" = %s AND "snapshotAt" >= %s AND "snapshotAt" < %s
                )
                """,
                (source_id, start_of_day, end_of_day),
            )
            cur.execute(
                'DELETE FROM toolify_trend_item WHERE "sourceId" = %s AND "snapshotAt" >= %s AND "snapshotAt" < %s',
                (source_id, start_of_day, end_of_day),
            )

            insert_sql = """
            INSERT INTO toolify_trend_item (
                id, "sourceId", "externalId", slug, rank, name, url,
                "monthlyVisits", "growthDisplay", "growthRate", summary, tags,
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
            f"[toolify] count={len(rows)} saved to Postgres (sourceId={source_id})"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    ingest_toolify_trends()
