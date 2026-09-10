#!/usr/bin/env python3
"""根据创作者后台采集数据，把已发布内容的状态自动翻转为 published。

数据源是 ``local-data/raw/notes/*.json`` 的私有每日笔记快照：只要某条内容的
``content_id`` 出现在任意一份快照里，就说明它已经在创作者后台可见，即已发布。

用法::

    python3 scripts/apply_publication_status.py              # 扫描全部快照
    python3 scripts/apply_publication_status.py --dry-run     # 只看不改
    python3 scripts/apply_publication_status.py --date 2026-09-08

只做两件事，且幂等：

* ``undated`` / ``planned`` 且已在后台出现 -> ``published``；
* 已发布但缺 ``publish_date`` / 笔记 ID 的，用后台数据补齐。

不会把任何 ``published`` 改回其它状态。
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

MASTER_REL = Path("data/content/content-master.json")
NOTES_DIR = Path("local-data/raw/notes")
FLIPPABLE = {"undated", "planned"}


def iter_note_files(root: Path, only_date: Optional[str]) -> List[Path]:
    notes_dir = root / NOTES_DIR
    if not notes_dir.is_dir():
        return []
    if only_date:
        target = notes_dir / f"{only_date}.json"
        return [target] if target.exists() else []
    return sorted(notes_dir.glob("*.json"))


def collect_evidence(root: Path, only_date: Optional[str]) -> Dict[str, Dict[str, Any]]:
    """汇总所有快照中出现过的内容，取最早的发布日期作为 publish_date。"""
    evidence: Dict[str, Dict[str, Any]] = {}
    for path in iter_note_files(root, only_date):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        snapshot_date = payload.get("snapshot_date") or path.stem
        for note in payload.get("notes") or []:
            content_id = note.get("content_id")
            if not content_id:
                continue
            publish_date = note.get("publish_date") or snapshot_date
            current = evidence.get(content_id)
            if current is None:
                evidence[content_id] = {
                    "publish_date": publish_date,
                    "note_id": note.get("note_id"),
                    "first_seen": snapshot_date,
                }
                continue
            if publish_date and publish_date < current["publish_date"]:
                current["publish_date"] = publish_date
            if not current.get("note_id") and note.get("note_id"):
                current["note_id"] = note.get("note_id")
            if snapshot_date < current["first_seen"]:
                current["first_seen"] = snapshot_date
    return evidence


def apply_to_master(master: Dict[str, Any], evidence: Dict[str, Dict[str, Any]]) -> Dict[str, List[str]]:
    flipped: List[str] = []
    backfilled: List[str] = []

    for item in master.get("contents") or []:
        content_id = item.get("content_id")
        hit = evidence.get(content_id)
        if not hit:
            continue

        if item.get("status") in FLIPPABLE:
            item["status"] = "published"
            flipped.append(content_id)

        if not item.get("publish_date") and hit.get("publish_date"):
            item["publish_date"] = hit["publish_date"]
            backfilled.append(content_id)

        if hit.get("note_id") and not item.get("xiaohongshu_note_id"):
            item["xiaohongshu_note_id"] = hit["note_id"]

    return {"flipped": flipped, "backfilled": backfilled}


def main() -> int:
    parser = argparse.ArgumentParser(description="按创作者后台数据翻转内容发布状态")
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--date", help="只使用指定日期的快照（YYYY-MM-DD）")
    parser.add_argument("--dry-run", action="store_true", help="只报告将要发生的改动，不写文件")
    args = parser.parse_args()

    root = args.project_root.resolve()
    master_path = root / MASTER_REL
    if not master_path.exists():
        raise SystemExit(f"找不到内容主表：{master_path}")

    master = json.loads(master_path.read_text(encoding="utf-8"))
    evidence = collect_evidence(root, args.date)
    result = apply_to_master(master, evidence)

    result["scanned_snapshots"] = len(iter_note_files(root, args.date))
    result["matched_in_backend"] = len(evidence)
    result["dry_run"] = args.dry_run

    if (result["flipped"] or result["backfilled"]) and not args.dry_run:
        master["updated_at"] = date.today().isoformat()
        master_path.write_text(
            json.dumps(master, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        result["written"] = str(master_path)
    else:
        result["written"] = None

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
