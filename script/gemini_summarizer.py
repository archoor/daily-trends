"""
基于 Gemini 的通用文案总结工具。

按数据源 slug 读取对应提示词文件（script/prompts/{slug}_summary.txt），
将结构化内容拼成一段文本传入 Gemini，返回中文总结。

若未配置 GEMINI_API_KEY，则打印提示并直接返回 None，不中断采集流程。
"""
import json
import os
from typing import Optional

import requests


class GeminiSummaryError(Exception):
    """调用 Gemini 生成总结时的异常。"""


def _load_env_for_script() -> None:
    """
    复用采集脚本的习惯：优先读取 script/.env，再读取项目根目录 .env，
    以便在本目录下直接运行时也能拿到 GEMINI_API_KEY、GEMINI_MODEL 等变量。
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))

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


def _load_prompt(source_slug: str) -> str:
    """
    根据数据源 slug 读取提示词：
    - 优先 script/prompts/{slug}_summary.txt
    - 无对应文件时退回 script/prompts/default_summary.txt
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    prompts_dir = os.path.join(script_dir, "prompts")

    candidates = [
        os.path.join(prompts_dir, f"{source_slug}_summary.txt"),
        os.path.join(prompts_dir, "default_summary.txt"),
    ]

    for path in candidates:
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as f:
                content = f.read().strip()
            if content:
                return content

    # 极端情况：提示词文件缺失时，给一个兜底提示
    return (
        "你是一名中文产品运营，负责为一个趋势榜单条目撰写简短总结。"
        "请基于给定的字段信息，用 2-3 句话概括该条目的核心亮点，适合作为详情页开头摘要。"
    )


def summarize_text_with_gemini(source_slug: str, content: str) -> Optional[str]:
    """
    使用 Gemini 为指定数据源生成页面内容总结。

    参数：
    - source_slug: 数据源标识，如 toolify/github/producthunt/google
    - content: 已拼接好的上下文文本（包含名称、核心字段等）

    返回：
    - 生成的中文总结字符串；若环境未配置或请求失败则返回 None。
    """
    if not content or not content.strip():
        return None

    _load_env_for_script()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        # 不阻断采集流程，直接跳过总结
        print("[gemini] GEMINI_API_KEY 未配置，跳过 Gemini 总结。")
        return None

    # 默认使用新版 Gemini 3 Flash Preview，如需回退可在环境变量中覆盖
    model = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
    endpoint = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    )

    system_prompt = _load_prompt(source_slug)

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": system_prompt,
                    },
                    {
                        "text": "\n\n【待总结内容】\n" + content.strip(),
                    },
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.5,
            "maxOutputTokens": 256,
        },
    }

    params = {"key": api_key}

    try:
        resp = requests.post(
            endpoint, params=params, json=payload, timeout=30
        )
    except requests.RequestException as e:
        print(f"[gemini] 请求失败，跳过总结：{e}")
        return None

    if resp.status_code != 200:
        print(
            f"[gemini] HTTP {resp.status_code}，body={resp.text[:200]!r}，跳过该条总结。"
        )
        return None

    try:
        data = resp.json()
    except json.JSONDecodeError as e:
        print(f"[gemini] 返回内容不是合法 JSON：{e}，body={resp.text[:200]!r}")
        return None

    candidates = data.get("candidates") or []
    if not candidates:
        print(f"[gemini] 未返回 candidates：{data}")
        return None

    parts = (
        (candidates[0].get("content") or {}).get("parts")
        if isinstance(candidates[0], dict)
        else None
    )
    if not parts:
        print(f"[gemini] candidates[0] 中没有 content.parts：{candidates[0]}")
        return None

    # 只取第一段文本
    text = parts[0].get("text") if isinstance(parts[0], dict) else None
    if not text:
        return None

    return text.strip()


__all__ = ["summarize_text_with_gemini", "GeminiSummaryError"]

