"""
基于 Gemini 的通用文案总结工具。

按数据源 slug 读取对应提示词文件（script/prompts/{slug}_summary*.txt），
将结构化内容拼成一段文本传入 Gemini，返回英文或中文页面级总结。

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


def _load_prompt(source_slug: str, lang: str = "en") -> str:
    """
    根据数据源 slug 与目标语言读取提示词：
    - 英文：script/prompts/{slug}_summary.txt，fallback 为 default_summary.txt
    - 中文：script/prompts/{slug}_summary_zh.txt，fallback 为 default_summary_zh.txt
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    prompts_dir = os.path.join(script_dir, "prompts")

    if lang == "zh":
        candidates = [
            os.path.join(prompts_dir, f"{source_slug}_summary_zh.txt"),
            os.path.join(prompts_dir, "default_summary_zh.txt"),
        ]
    else:
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
    if lang == "zh":
        return (
            "你是一名中文分析师，负责为一个趋势榜单页面撰写简短的中文总结。"
            "请基于给定的结构化数据，用 1-3 个自然段概括今天最有意思的变化和主题，语气自然、易读。"
        )
    return (
        "You are an English-speaking analyst writing a short, engaging overview "
        "for a trends page. In 1-3 short paragraphs, describe the most interesting "
        "changes and themes in clear, simple English."
    )


def summarize_text_with_gemini(
    source_slug: str,
    content: str,
    lang: str = "en",
) -> Optional[str]:
    """
    使用 Gemini 为指定数据源生成页面内容总结。

    参数：
    - source_slug: 数据源标识，如 toolify/github/producthunt/google
    - content: 已拼接好的上下文文本（包含名称、核心字段等）
    - lang: 输出语言，"en" 表示英文总结，"zh" 表示中文总结（默认 "en"）

    返回：
    - 生成的总结字符串（英文或中文）；若环境未配置或请求失败则返回 None。
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

    system_prompt = _load_prompt(source_slug, lang=lang)

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
            # 页面级总结允许更长输出（最多约 400 词），
            # 适配不同模型时可按需在环境变量中覆盖。
            "maxOutputTokens": int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "900")),
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

    # 拼接所有文本段，避免只取第一段导致总结被截断
    texts = []
    for part in parts:
        if isinstance(part, dict):
            t = part.get("text")
            if isinstance(t, str) and t.strip():
                texts.append(t.strip())

    full_text = "\n\n".join(texts).strip()
    if not full_text:
        return None

    return full_text


__all__ = ["summarize_text_with_gemini", "GeminiSummaryError"]

