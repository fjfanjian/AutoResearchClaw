#!/usr/bin/env python3
"""测试 Semantic Scholar API 是否可用（镜像 vs 官方端点）。"""

import json
import urllib.request
import urllib.parse
import urllib.error
import sys
import time
import os

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------
FIELDS = "paperId,title,abstract,year,venue,citationCount,authors,externalIds,url"
TIMEOUT = 30

# 从环境变量读取你的 key（如果有的话）
S2_API_KEY = os.environ.get("S2_API_KEY", "")

ENDPOINTS = {
    "ai4scholar.net (镜像)": {
        "search": "https://ai4scholar.net/graph/v1/paper/search",
        "batch": "https://ai4scholar.net/graph/v1/paper/batch",
        "header_name": "Authorization",       # 镜像用 Authorization
        "header_value": f"Bearer {S2_API_KEY}" if S2_API_KEY else "",
    },
    "api.semanticscholar.org (官方)": {
        "search": "https://api.semanticscholar.org/graph/v1/paper/search",
        "batch": "https://api.semanticscholar.org/graph/v1/paper/batch",
        "header_name": "x-api-key",            # 官方用 x-api-key
        "header_value": S2_API_KEY,
    },
}


# ---------------------------------------------------------------------------
# 测试函数
# ---------------------------------------------------------------------------

def test_search(name: str, base_url: str, header_name: str, header_value: str,
                query: str, limit: int = 5) -> dict | None:
    """测试搜索接口"""
    params = urllib.parse.urlencode({
        "query": query,
        "limit": str(limit),
        "fields": FIELDS,
    })
    url = f"{base_url}?{params}"
    headers = {"Accept": "application/json"}
    if header_value:
        headers[header_name] = header_value

    print(f"  URL: {url[:120]}...")
    if header_value:
        print(f"  Auth: {header_name}={header_value[:20]}...")

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            print(f"  ✅ HTTP {resp.status}")
            return data
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8")[:200]
        except Exception:
            pass
        print(f"  ❌ HTTP {e.code}: {detail}")
        return None
    except urllib.error.URLError as e:
        print(f"  ❌ URL 错误: {e.reason}")
        return None
    except json.JSONDecodeError as e:
        print(f"  ❌ JSON 解析失败: {e}")
        return None
    except Exception as e:
        print(f"  ❌ 未知错误: {e}")
        return None


def print_papers(data: dict | None, max_show: int = 3):
    """打印论文结果"""
    if data is None:
        print("  无数据\n")
        return

    papers = data.get("data", []) if isinstance(data, dict) else []
    if not papers:
        print("  无结果\n")
        return

    print(f"  共 {len(papers)} 篇论文 (显示前 {max_show} 篇):")
    for i, p in enumerate(papers[:max_show], 1):
        title = p.get("title", "N/A")
        year = p.get("year", "?")
        cite = p.get("citationCount", 0)
        authors = p.get("authors", [])
        author_str = ", ".join(a.get("name", "?") for a in authors[:3])
        if len(authors) > 3:
            author_str += " et al."
        print(f"  [{i}] {title}")
        print(f"      年份: {year} | 引用: {cite} | 作者: {author_str}")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 65)
    print("Semantic Scholar API 可用性测试")
    print(f"S2_API_KEY={'已设置' if S2_API_KEY else '未设置 (将使用无 key 模式)'}")
    print("=" * 65)

    results = {}

    for name, cfg in ENDPOINTS.items():
        print(f"\n{'='*65}")
        print(f"📡 测试端点: {name}")
        print(f"{'='*65}")

        # 搜索测试
        data = test_search(name, cfg["search"], cfg["header_name"],
                           cfg["header_value"], "transformer attention", limit=5)
        print_papers(data)
        results[name] = data is not None

        time.sleep(1.5)

        # 无结果搜索 (测错误处理)
        data2 = test_search(name, cfg["search"], cfg["header_name"],
                            cfg["header_value"], "zzzzzznonexistent", limit=3)
        print(f"  (无结果查询: {'正常' if data2 is not None else '失败'})")
        print()

        time.sleep(1.5)

    # ---- DNS 诊断 ----
    print("=" * 65)
    print("🌐 网络诊断")
    print("=" * 65)
    import socket
    for host in ["ai4scholar.net", "api.semanticscholar.org"]:
        try:
            ip = socket.getaddrinfo(host, 443)[0][4][0]
            print(f"  ✅ {host} → {ip}")
        except Exception as e:
            print(f"  ❌ {host} → {e}")

    # ---- 项目代码问题分析 ----
    print("\n" + "=" * 65)
    print("🔧 项目代码分析")
    print("=" * 65)
    print(f"  项目使用 header: x-api-key (见 semantic_scholar.py:197,309)")
    print(f"  ai4scholar.net 期望: Authorization: Bearer <key>")
    print(f"  官方端点期望: x-api-key: <key>")
    print()
    if results.get("api.semanticscholar.org (官方)"):
        print("  ✅ 建议: 将 _BASE_URL 改为官方端点 api.semanticscholar.org")
    elif results.get("ai4scholar.net (镜像)") and S2_API_KEY:
        print("  ⚠ ai4scholar.net 可用但 header 不匹配，需改代码中的 header 为 Authorization")
    else:
        print("  ⚠ 两个端点都有问题，请检查网络或 API key")

    # ---- 总体结论 ----
    any_ok = any(results.values())
    print(f"\n{'='*65}")
    if any_ok:
        ok_names = [k for k, v in results.items() if v]
        print(f"✅ 结论: 以下端点可用 — {ok_names}")
        sys.exit(0)
    else:
        print("❌ 结论: 所有端点均不可用")
        print("   建议: 检查网络连接 / 设置 S2_API_KEY 环境变量")
        print("   export S2_API_KEY=your_key_here")
        sys.exit(1)


if __name__ == "__main__":
    main()
