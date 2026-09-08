#!/usr/bin/env python3
"""Remove private creator-console data from files published by GitHub Pages.

The original static export embeds its initial state inside an RSC script chunk.
This release helper keeps schedule metadata intact while removing raw metrics,
private creator-console URLs, reviews based on those metrics, and note IDs.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, Tuple


RSC_PUSH = re.compile(r'self\.__VINEXT_RSC_CHUNKS__\.push\(("(?:\\.|[^"\\])*")\)')
INITIAL_MARKER = '{"initial"'
PUBLIC_LIMITATION = "公开静态站点不包含创作者后台原始数据；数据与复盘仅使用 data/derived/ 中的派生结果。"


def scrub_initial(initial: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, int]]:
    data = initial.get("initial", {}).get("data")
    if not isinstance(data, dict):
        raise ValueError("RSC 初始状态中未找到 initial.data。")

    counts = {
        "snapshots": len(data.get("snapshots") or []),
        "accounts": len(data.get("accounts") or []),
        "reviews": len(data.get("reviews") or []),
        "content_links": 0,
        "note_ids": 0,
    }
    data["snapshots"] = []
    data["accounts"] = []
    data["reviews"] = []
    data["limitations"] = [PUBLIC_LIMITATION]
    for content in data.get("contents") or []:
        if content.get("noteId"):
            counts["note_ids"] += 1
            content["noteId"] = None
        source_url = content.get("sourceUrl")
        if isinstance(source_url, str) and "creator.xiaohongshu.com" in source_url:
            counts["content_links"] += 1
            content["sourceUrl"] = None
    return initial, counts


def scrub_index(path: Path) -> Dict[str, int]:
    html = path.read_text(encoding="utf-8")
    total = {"snapshots": 0, "accounts": 0, "reviews": 0, "content_links": 0, "note_ids": 0}
    found = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal found
        chunk = json.loads(match.group(1))
        marker = chunk.find(INITIAL_MARKER)
        if marker < 0:
            return match.group(0)
        payload, consumed = json.JSONDecoder().raw_decode(chunk[marker:])
        scrubbed, counts = scrub_initial(payload)
        for key, value in counts.items():
            total[key] += value
        found += 1
        replacement = json.dumps(scrubbed, ensure_ascii=False, separators=(",", ":"))
        new_chunk = chunk[:marker] + replacement + chunk[marker + consumed:]
        return f"self.__VINEXT_RSC_CHUNKS__.push({json.dumps(new_chunk, ensure_ascii=False)})"

    rendered = RSC_PUSH.sub(replace, html)
    if found != 1:
        raise ValueError(f"预期找到 1 个初始状态，实际找到 {found} 个；未写入。")
    path.write_text(rendered, encoding="utf-8")
    return total


def scrub_content_master(path: Path) -> Dict[str, int]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    counts = {"note_ids": 0, "creator_urls": 0}
    for content in payload.get("contents") or []:
        if content.get("xiaohongshu_note_id"):
            counts["note_ids"] += 1
        if content.get("xiaohongshu_url"):
            counts["creator_urls"] += 1
        content["xiaohongshu_note_id"] = None
        content["xiaohongshu_url"] = None
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="清理公开静态文件中的创作者后台原始数据")
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.project_root.resolve()
    index_counts = scrub_index(root / "index.html")
    master_counts = scrub_content_master(root / "data/content/content-master.json")
    print(json.dumps({"index": index_counts, "content_master": master_counts}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
