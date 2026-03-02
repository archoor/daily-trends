import json
import os
import re
import sqlite3
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from google_serpapi_client import (
    SerpApiError,
    fetch_google_trends_trending_now,
)


PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))


def _dt_to_iso(dt: datetime) -> str:
    dt = dt.astimezone(timezone.utc).replace(microsecond=0)
    return dt.isoformat().replace("+00:00", "Z")


def _slugify(value: str) -> str:
    value_norm = unicodedata.normalize("NFKD", value)
    value_ascii = value_norm.encode("ascii", "ignore").decode("ascii")
    value_ascii = re.sub(r"[^a-zA-Z0-9]+", "-", value_ascii)
    value_ascii = value_ascii.strip("-").lower()
    return value_ascii or "trend"


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


def _get_or_create_google_source_id(conn: sqlite3.Connection) -> str:
    cur = conn.cursor()
    cur.execute("SELECT id FROM data_source WHERE slug = ?", ("google",))
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
            "google",
            "Google Trends",
            "https://trends.google.com",
            1,
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
            1 if is_active else 0,
            related_keywords,
            more_related_count,
            snapshot_iso,
            now_iso,
            now_iso,
        )
        rows.append(row)

    return rows


def ingest_google_trends(
    *,
    geo: str = "US",
    hours: int = 24,
    category_id: Optional[int] = None,
    only_active: Optional[bool] = None,
    hl: str = "en",
) -> None:
    database_path = _resolve_sqlite_path_from_env()

    conn = sqlite3.connect(database_path)
    try:
        conn.execute("PRAGMA foreign_keys = ON;")

        source_id = _get_or_create_google_source_id(conn)

        trending_items = fetch_google_trends_trending_now(
            geo=geo,
            hours=hours,
            category_id=category_id,
            only_active=only_active,
            hl=hl,
        )

        snapshot_at = datetime.now(timezone.utc)

        rows = _map_trending_to_rows(source_id, trending_items, snapshot_at)

        cur = conn.cursor()

        cur.execute(
            "DELETE FROM google_trend_item WHERE sourceId = ?",
            (source_id,),
        )

        insert_sql = """
        INSERT INTO google_trend_item (
            id,
            sourceId,
            externalId,
            slug,
            rank,
            name,
            searchVolume,
            searchVolumeDisplay,
            growthRate,
            startedAt,
            endedAt,
            isActive,
            relatedKeywords,
            moreRelatedCount,
            snapshotAt,
            createdAt,
            updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """

        cur.executemany(insert_sql, rows)
        conn.commit()

        print(
            f"[google_trends] geo={geo} hours={hours} count={len(rows)} saved to {database_path}"
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

