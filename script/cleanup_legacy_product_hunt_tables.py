"""
清理数据库中遗留的旧版 Product Hunt 表（表名中包含 `product-hunt` 的那一批）。

当前正式使用的表：
- data_source              （slug = 'producthunt'）
- product_hunt_trend_item
- product_hunt_trend_detail

本脚本会：
1. 连接当前 DATABASE_URL 指向的 Postgres；
2. 列出 public schema 下所有表名包含 'product-hunt' 的表；
3. 依次执行 DROP TABLE IF EXISTS 进行删除；
4. 打印被删除的表名，若没有匹配则仅提示“无遗留表”。

运行方式（项目根目录）：

    python script/cleanup_legacy_product_hunt_tables.py
"""
import os
from typing import List

import psycopg


def _load_env_for_script() -> None:
    """
    加载脚本需要的环境变量：
    - 优先从 script/.env
    - 然后从项目根目录 .env
    不覆盖已存在的同名变量。
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

    # 2) 项目根目录 .env
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
        raise RuntimeError("DATABASE_URL 未配置，请在环境变量或 script/.env 中设置。")
    if not url.startswith("postgres"):
        raise RuntimeError("当前脚本仅支持 postgresql:// 开头的连接串。")
    return psycopg.connect(url)


def _find_legacy_product_hunt_tables(conn: "psycopg.Connection") -> List[str]:
    """
    查找 public schema 下名字中包含 'product-hunt' 的表。
    """
    tables: List[str] = []
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT tablename
            FROM pg_catalog.pg_tables
            WHERE schemaname = 'public'
              AND tablename ILIKE '%product-hunt%';
            """
        )
        for (name,) in cur.fetchall():
            tables.append(str(name))
    return tables


def cleanup_legacy_product_hunt_tables() -> None:
    conn = _get_pg_conn_from_env()
    try:
        tables = _find_legacy_product_hunt_tables(conn)
        if not tables:
            print("[cleanup] No legacy product-hunt* tables found in public schema.")
            return

        print("[cleanup] Found legacy tables (will be dropped):")
        for name in tables:
            print(f"  - {name}")

        with conn.cursor() as cur:
            for name in tables:
                # 使用标识符插入，避免 SQL 注入；legacy 名称来自系统 catalog，本身是可信的。
                cur.execute(f'DROP TABLE IF EXISTS "{name}" CASCADE;')
        conn.commit()
        print("[cleanup] Drop finished.")
    finally:
        conn.close()


if __name__ == "__main__":
    cleanup_legacy_product_hunt_tables()

