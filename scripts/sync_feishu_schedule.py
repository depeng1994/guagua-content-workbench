#!/usr/bin/env python3
"""手动同步排期：读取飞书排期表导出，更新内容主表，再刷新工作台。

这是「人维护」的那一半链路——排期由你在飞书里改，改完导出放进 imports/，
跑一次本脚本即可同步到工作台。已发布状态由每日自动任务负责，这里不会
把 published 改回其它状态。

用法::

    python3 scripts/sync_feishu_schedule.py --file imports/排期表.csv
    python3 scripts/sync_feishu_schedule.py --dry-run      # 只看不改
    python3 scripts/sync_feishu_schedule.py --push         # 同步完自动提交推送

不指定 --file 时，自动取 imports/ 下最新的一份 CSV/Excel（跳过 example 示例）。

说明：飞书读取工具在当前环境不可用，因此本脚本读取「飞书导出文件」。
将来若开放平台可用，只需替换 load_rows() 的数据来源，其余逻辑不变。
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

MASTER_REL = Path("data/content/content-master.json")
IMPORTS_DIR = Path("imports")

COLUMN_ALIASES: Dict[str, Tuple[str, ...]] = {
    "content_id": ("contentid", "内容id", "内容编号", "编号", "id", "作品编号"),
    "title": ("标题", "笔记标题", "内容标题", "title", "主题名"),
    "series": ("系列", "series", "栏目"),
    "topic": ("主题", "topic", "短名"),
    "planned_date": ("计划发布日期", "计划发布", "排期日期", "计划日期", "planneddate", "发布日期"),
    "status": ("状态", "status", "发布状态"),
    "note_id": ("笔记id", "noteid", "小红书笔记id"),
    "url": ("链接", "url", "笔记链接", "小红书链接"),
    "content_type": ("内容类型", "形式", "contenttype", "类型"),
}

STATUS_MAP = {
    "已发布": "published",
    "published": "published",
    "已排期": "planned",
    "待发布": "planned",
    "planned": "planned",
    "待确认排期": "undated",
    "待确认": "undated",
    "待定": "undated",
    "undated": "undated",
}

DEFAULT_PALETTE = ["#7652CF", "#3165D5", "#9B6C16", "#2E7D6B", "#C2553F", "#5B6B8C"]


def normalize_key(name: str) -> str:
    return re.sub(r"[\s_\-（）()]+", "", str(name or "")).lower()


# 主题名归一化：飞书表可能写「Manner×M Stand」，主表写「Manner／M Stand」；
# 去掉这些分隔符后再比对，能明显提高匹配率。
_NORM_STRIP = re.compile(r"[\s_\-（）()×／/｜|·・—–&]+")


def norm_text(text: str) -> str:
    return _NORM_STRIP.sub("", str(text or "")).lower()


def map_columns(header: List[str]) -> Dict[str, int]:
    normalized = [normalize_key(h) for h in header]
    mapping: Dict[str, int] = {}
    for field, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            key = normalize_key(alias)
            for index, value in enumerate(normalized):
                if value == key:
                    mapping[field] = index
                    break
            if field in mapping:
                break
    return mapping


def normalize_date(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    if not text:
        return None
    match = re.search(r"(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})", text)
    if match:
        year, month, day = match.groups()
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    return text


def load_rows(path: Path) -> List[Dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xlsm"}:
        from openpyxl import load_workbook

        workbook = load_workbook(path, data_only=True)
        sheet = workbook[workbook.sheetnames[0]]
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            return []
        header = [str(cell or "") for cell in rows[0]]
        mapping = map_columns(header)
        return [
            {field: row[index] for field, index in mapping.items() if index < len(row)}
            for row in rows[1:]
            if any(cell is not None and str(cell).strip() for cell in row)
        ]

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        rows = list(reader)
    if not rows:
        return []
    mapping = map_columns(rows[0])
    return [
        {field: row[index] for field, index in mapping.items() if index < len(row)}
        for row in rows[1:]
        if any(cell.strip() for cell in row)
    ]


def pick_latest_import(root: Path) -> Optional[Path]:
    folder = root / IMPORTS_DIR
    if not folder.is_dir():
        return None
    candidates = [
        path
        for path in folder.iterdir()
        if path.is_file()
        and path.suffix.lower() in {".csv", ".xlsx", ".xlsm"}
        and "example" not in path.name.lower()
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item.stat().st_mtime)


def ensure_series(master: Dict[str, Any], name: str) -> str:
    for item in master.get("series") or []:
        if item.get("name") == name:
            return item["series_id"]
    numbers = [
        int(match.group(1))
        for item in master.get("series") or []
        for match in [re.search(r"(\d+)$", str(item.get("series_id", "")))]
        if match
    ]
    next_number = (max(numbers) + 1) if numbers else len(master.get("series") or []) + 1
    series_id = f"SER-{next_number:02d}"
    order = max((item.get("order") or 0) for item in master.get("series") or []) + 1
    color = DEFAULT_PALETTE[(order - 1) % len(DEFAULT_PALETTE)]
    master.setdefault("series", []).append(
        {"series_id": series_id, "name": name, "color": color, "order": order, "aliases": []}
    )
    return series_id


def next_content_id(master: Dict[str, Any]) -> str:
    numbers = [
        int(match.group(1))
        for item in master.get("contents") or []
        for match in [re.search(r"GG-P(\d+)$", str(item.get("content_id", "")))]
        if match
    ]
    return f"GG-P{(max(numbers) + 1) if numbers else 1:03d}"


def main() -> int:
    parser = argparse.ArgumentParser(description="从飞书排期表导出更新内容主表")
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--file", type=Path, help="排期表导出文件，默认取 imports/ 下最新一份")
    parser.add_argument("--add-new", action="store_true", help="表里新增但主表没有的条目，自动建档")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--no-site-sync",
        action="store_true",
        help="只更新内容主表，不重刷页面（由调用方统一刷，避免重复）",
    )
    parser.add_argument("--push", action="store_true", help="同步后自动 commit + push")
    args = parser.parse_args()

    root = args.project_root.resolve()
    master_path = root / MASTER_REL
    source = args.file or pick_latest_import(root)
    if source is None:
        raise SystemExit("没有找到排期表导出文件；请放到 imports/ 或用 --file 指定。")
    source = Path(source)
    if not source.exists():
        raise SystemExit(f"文件不存在：{source}")

    rows = load_rows(source)
    if not rows:
        raise SystemExit(f"没有解析到任何行：{source}")

    master = json.loads(master_path.read_text(encoding="utf-8"))
    contents = master.setdefault("contents", [])
    by_id = {item.get("content_id"): item for item in contents}
    by_title = {str(item.get("title", "")).strip(): item for item in contents}
    # 飞书表的「内容」列就是主表的 topic，用它做主要匹配键
    by_topic = {}
    by_topic_norm = {}
    for item in contents:
        existing_topic = str(item.get("topic") or "").strip()
        if existing_topic:
            by_topic.setdefault(existing_topic, item)
            by_topic_norm.setdefault(norm_text(existing_topic), item)

    updated: List[str] = []
    created: List[str] = []
    skipped: List[str] = []

    for row in rows:
        title = str(row.get("title") or "").strip()
        content_id = str(row.get("content_id") or "").strip() or None
        topic = str(row.get("topic") or "").strip()

        target = by_id.get(content_id) if content_id else None
        if target is None and title:
            target = by_title.get(title)
        if target is None and topic:
            target = by_topic.get(topic)
        if target is None and topic:
            target = by_topic_norm.get(norm_text(topic))
        if target is None and topic:
            # 包含匹配：飞书「山姆」↔ 主表「山姆会员费」、飞书「安踏品牌局总览」↔「安踏品牌局」
            needle = norm_text(topic)
            if len(needle) >= 2:
                for key, item in by_topic_norm.items():
                    if len(key) >= 2 and (key.startswith(needle) or needle.startswith(key)):
                        target = item
                        break
        if target is None:
            if not (args.add_new and title):
                skipped.append(title or content_id or "未命名")
                continue
            series_name = str(row.get("series") or "未分类").strip()
            ensure_series(master, series_name)
            target = {
                "content_id": content_id or next_content_id(master),
                "publish_date": None,
                "planned_date": None,
                "series": series_name,
                "topic": str(row.get("topic") or title).strip(),
                "title": title,
                "status": "planned",
                "xiaohongshu_note_id": None,
                "xiaohongshu_url": None,
                "content_type": str(row.get("content_type") or "未分类").strip(),
                "title_type": "未分类",
                "industry": None,
                "tags": [],
            }
            contents.append(target)
            by_id[target["content_id"]] = target
            by_title[title] = target
            created.append(target["content_id"])

        changed = False
        # 已发布的以小红书为准：不用飞书的规划值覆盖已发布内容的标题/分类/计划日期
        already_published = target.get("status") == "published"
        if not already_published:
            for field in ("series", "topic", "title"):
                value = row.get(field)
                if value is not None and str(value).strip() and str(value).strip() != str(target.get(field) or ""):
                    if field == "series":
                        ensure_series(master, str(value).strip())
                    target[field] = str(value).strip()
                    changed = True

            planned = normalize_date(row.get("planned_date"))
            if planned and planned != target.get("planned_date"):
                target["planned_date"] = planned
                changed = True

        raw_status = str(row.get("status") or "").strip()
        mapped = STATUS_MAP.get(raw_status)
        # 只升级不回退：已发布的不会被排期表改回其它状态
        if mapped and mapped != target.get("status") and target.get("status") != "published":
            target["status"] = mapped
            changed = True

        note_id = row.get("note_id")
        if note_id and str(note_id).strip() and not target.get("xiaohongshu_note_id"):
            target["xiaohongshu_note_id"] = str(note_id).strip()
            changed = True

        url = row.get("url")
        if url and str(url).strip() and not target.get("xiaohongshu_url"):
            target["xiaohongshu_url"] = str(url).strip()
            changed = True

        if changed and target["content_id"] not in created:
            updated.append(target["content_id"])

    summary = {
        "source": str(source),
        "rows": len(rows),
        "updated": updated,
        "created": created,
        "skipped_unmatched": skipped,
        "dry_run": args.dry_run,
    }

    if args.dry_run:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    master["updated_at"] = date.today().isoformat()
    master_path.write_text(json.dumps(master, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    python = sys.executable or "python3"
    if args.no_site_sync:
        summary["site_synced"] = False
    else:
        for script in ("sync_content_master.py", "sanitize_public_snapshot.py"):
            result = subprocess.run(
                [python, str(root / "scripts" / script), "--project-root", str(root)],
                cwd=str(root),
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise SystemExit(f"{script} 失败：{result.stderr.strip()}")
        summary["site_synced"] = True

    if args.push:
        subprocess.run(["git", "add", "data", "index.html"], cwd=str(root), check=False)
        message = f"chore(schedule): {date.today().isoformat()} 排期同步"
        subprocess.run(["git", "commit", "-m", message], cwd=str(root), check=False)
        pushed = subprocess.run(
            ["git", "push", "origin", "main"], cwd=str(root), capture_output=True, text=True
        )
        summary["pushed"] = pushed.returncode == 0

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
