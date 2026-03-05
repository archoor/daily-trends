"""
导出数据源及页面总结为 Markdown 文件。

读取当前数据库中的 data_source 表（slug、name、baseUrl、description），
将每个数据源及其 Gemini 生成的页面级总结写入一个 markdown 文件，方便审阅与调试。

运行方式（在项目根目录）：

    python script/export_source_summaries_md.py

输出文件默认路径：script/source_summaries.md
"""
import os
from datetime import datetime, timezone
from typing import List, Tuple

import psycopg


def _load_env_for_script() -> None:
  """
  加载采集脚本需要的环境变量：
  - 优先从 script 目录下的 .env 读取（数据库连接与第三方密钥）
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
  """
  从环境变量 DATABASE_URL 获取 Postgres 连接。
  例如：postgresql://user:pass@host:port/dbname
  """
  _load_env_for_script()
  url = os.getenv("DATABASE_URL")
  if not url:
    raise RuntimeError("DATABASE_URL 未配置，请在环境变量或 script/.env 中设置。")
  if not url.startswith("postgres"):
    raise RuntimeError("当前脚本只支持 postgresql:// 开头的连接串。")
  return psycopg.connect(url)


def _fetch_sources(conn: "psycopg.Connection") -> List[Tuple[str, str, str, str]]:
  """
  返回所有数据源的 (slug, name, baseUrl, description)。
  description 可能为空字符串。
  """
  rows: List[Tuple[str, str, str, str]] = []
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT slug, name, COALESCE("baseUrl", ''), COALESCE(description, '')
      FROM data_source
      WHERE "isActive" = TRUE
      ORDER BY slug ASC
      """
    )
    for slug, name, base_url, description in cur.fetchall():
      rows.append(
        (
          str(slug),
          str(name),
          str(base_url or ""),
          str(description or ""),
        )
      )
  return rows


def _build_markdown(sources: List[Tuple[str, str, str, str]]) -> str:
  """
  构造 Markdown 文本。
  结构：
  # Data source summaries
  ## Name (`slug`)
  - Base URL: ...
  - Has summary: Yes/No

  Summary:
  ...
  """
  now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
  lines: List[str] = []
  lines.append("# Data source summaries")
  lines.append("")
  lines.append(f"_Generated at {now} (UTC)._")
  lines.append("")

  if not sources:
    lines.append("No active data sources found in `data_source` table.")
    return "\n".join(lines)

  for slug, name, base_url, description in sources:
    lines.append(f"## {name} (`{slug}`)")
    lines.append("")
    if base_url:
      lines.append(f"- **Base URL**: {base_url}")
    else:
      lines.append(f"- **Base URL**: (none)")
    has_summary = bool(description.strip())
    lines.append(f"- **Has summary**: {'Yes' if has_summary else 'No'}")
    lines.append("")
    lines.append("**Summary**:")
    lines.append("")
    if has_summary:
      # 保持原有分段结构，避免全部压成一行
      for para in description.replace("\r\n", "\n").split("\n\n"):
        para = para.strip()
        if not para:
          continue
        lines.append(para)
        lines.append("")
    else:
      lines.append("_No summary stored in `data_source.description` yet._")
      lines.append("")

  return "\n".join(lines).rstrip() + "\n"


def export_source_summaries_md(output_path: str | None = None) -> str:
  """
  查询数据库并导出 markdown。

  返回实际写入的文件绝对路径。
  """
  script_dir = os.path.dirname(os.path.abspath(__file__))
  if output_path is None:
    output_path = os.path.join(script_dir, "source_summaries.md")

  conn = _get_pg_conn_from_env()
  try:
    sources = _fetch_sources(conn)
  finally:
    conn.close()

  md = _build_markdown(sources)
  os.makedirs(os.path.dirname(output_path), exist_ok=True)
  with open(output_path, "w", encoding="utf-8") as f:
    f.write(md)

  return os.path.abspath(output_path)


if __name__ == "__main__":
  path = export_source_summaries_md()
  print(f"[export_source_summaries_md] Markdown written to: {path}")

