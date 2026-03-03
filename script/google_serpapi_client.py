import os
from typing import Any, Dict, List, Optional

import requests


SERPAPI_ENDPOINT = "https://serpapi.com/search"


class SerpApiError(Exception):
    """SerpApi 调用失败时抛出的异常。"""


def fetch_google_trends_trending_now(
    *,
    geo: str = "US",
    hours: int = 24,
    category_id: Optional[int] = None,
    only_active: Optional[bool] = None,
    hl: str = "en",
    api_key: Optional[str] = None,
    timeout: int = 15,
) -> List[Dict[str, Any]]:
    """
    调用 SerpApi 的 Google Trends Trending Now 接口，返回 trending_searches 列表。

    参数：
    - geo: 地区代码，默认 "US"，示例：CN / US / JP 等。
    - hours: 过去多少小时，SerpApi 支持值：4 / 24 / 48 / 168（7天），默认 24。
    - category_id: 类别 ID，可选；详见 SerpApi 文档的 categories 列表。
    - only_active: 是否只返回当前 active 的趋势（True / False），None 表示不加此过滤。
    - hl: 语言代码，默认 "en"。
    - api_key: SerpApi API Key；若不传则从环境变量 SERPAPI_API_KEY 读取。
    - timeout: HTTP 请求超时时间（秒）。

    返回：
    - SerpApi 返回的 data["trending_searches"] 列表（每个元素为一个 dict）。

    异常：
    - SerpApiError：HTTP 请求失败或返回结构异常时抛出。
    """
    key = api_key or os.getenv("SERPAPI_API_KEY")
    if not key:
        raise SerpApiError("SERPAPI_API_KEY 未配置，请在环境变量或参数中提供 api_key。")

    params: Dict[str, Any] = {
        "engine": "google_trends_trending_now",
        "geo": geo,
        "hours": hours,
        "hl": hl,
        "api_key": key,
        "output": "json",
    }

    if category_id is not None:
        params["category_id"] = category_id

    if only_active is not None:
        params["only_active"] = str(only_active).lower()

    try:
        resp = requests.get(SERPAPI_ENDPOINT, params=params, timeout=timeout)
    except requests.RequestException as e:
        raise SerpApiError(f"请求 SerpApi 失败：{e}") from e

    if resp.status_code != 200:
        raise SerpApiError(f"SerpApi 返回非 200 状态码：{resp.status_code}，body={resp.text[:500]}")

    try:
        data = resp.json()
    except ValueError as e:
        raise SerpApiError(f"SerpApi 返回内容不是合法 JSON：{e}, body={resp.text[:200]}") from e

    trending = data.get("trending_searches")
    if trending is None:
        raise SerpApiError(f"SerpApi 返回中没有 trending_searches 字段：{data.keys()}")

    if not isinstance(trending, list):
        raise SerpApiError("SerpApi 返回的 trending_searches 不是列表类型。")

    return trending


if __name__ == "__main__":
    results = fetch_google_trends_trending_now(geo="US", hours=24, only_active=True)
    print(f"got {len(results)} trending_searches")
    if results:
        from pprint import pprint

        pprint(results[0])

