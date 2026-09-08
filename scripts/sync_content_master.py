#!/usr/bin/env python3
"""Regenerate the legacy schedule compatibility snapshot from content-master.

The existing schedule UI still consumes the static RSC payload in index.html.
This adapter makes ``data/content/content-master.json`` the maintained source
without patching the bundled application or changing its visual structure.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict

from sanitize_public_snapshot import INITIAL_MARKER, RSC_PUSH, scrub_initial


STATUS_LABELS = {
    "published": "已发布",
    "planned": "已排期",
    "undated": "待确认排期",
}


def sync_index(index_path: Path, master_path: Path) -> Dict[str, int]:
    master = json.loads(master_path.read_text(encoding="utf-8"))
    html = index_path.read_text(encoding="utf-8")
    found = 0

    def replace(match):
        nonlocal found
        chunk = json.loads(match.group(1))
        marker = chunk.find(INITIAL_MARKER)
        if marker < 0:
            return match.group(0)
        payload, consumed = json.JSONDecoder().raw_decode(chunk[marker:])
        data = payload.get("initial", {}).get("data")
        if not isinstance(data, dict):
            raise ValueError("RSC 初始状态中未找到 initial.data。")

        old_by_id = {item.get("id"): item for item in data.get("contents") or []}
        series_id_by_name = {item["name"]: item["series_id"] for item in master.get("series") or []}
        contents = []
        for item in master.get("contents") or []:
            compatible: Dict[str, Any] = dict(old_by_id.get(item["content_id"], {}))
            compatible.update({
                "id": item["content_id"],
                "title": item["title"],
                "short": item["topic"],
                "format": item["content_type"],
                "status": STATUS_LABELS[item["status"]],
                "publishedDate": item.get("publish_date"),
                "plannedDate": item.get("planned_date"),
                "noteId": None,
                "sourceUrl": None,
                "seriesId": series_id_by_name[item["series"]],
            })
            contents.append(compatible)
        data["contents"] = contents
        data["series"] = [
            {
                "id": item["series_id"],
                "name": item["name"],
                "color": item["color"],
                "order": item["order"],
                "aliases": item.get("aliases", []),
            }
            for item in master.get("series") or []
        ]
        scrub_initial(payload)
        found += 1
        replacement = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        new_chunk = chunk[:marker] + replacement + chunk[marker + consumed:]
        return f"self.__VINEXT_RSC_CHUNKS__.push({json.dumps(new_chunk, ensure_ascii=False)})"

    rendered = RSC_PUSH.sub(replace, html)
    if found != 1:
        raise ValueError(f"预期找到 1 个初始状态，实际找到 {found} 个；未写入。")
    index_path.write_text(rendered, encoding="utf-8")
    return {"contents": len(master.get("contents") or []), "series": len(master.get("series") or [])}


def main() -> int:
    parser = argparse.ArgumentParser(description="从内容主表刷新现有排期 UI 的兼容快照")
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.project_root.resolve()
    result = sync_index(root / "index.html", root / "data/content/content-master.json")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
