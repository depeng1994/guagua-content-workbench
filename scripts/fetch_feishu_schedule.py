#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从飞书「数据底表」拉取排期，导出成 sync_feishu_schedule.py 能直接读的 CSV。

飞书表格：https://my.feishu.cn/wiki/EZZGwXAgkiw5Fykb9lTc69xwnBh
  → 电子表格「数据底表」/ 工作表「00-排期表」
  → 有效列：日期 | 系列 | 内容 | 标题

输出 imports/feishu-schedule-<日期>.csv，列名用下游脚本认识的别名
（计划发布日期 / 系列 / 主题 / 标题），这样 sync_feishu_schedule.py 不用改列映射。

这是「人维护的那一半」的数据来源：排期在飞书里改，刷新数据时自动拉下来。
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Any, List

SPREADSHEET_TOKEN = "SNcEsVTS4hppIhtihuOcp3KOn1c"
SHEET_ID = "27f96b"
HEADER = ["计划发布日期", "系列", "主题", "标题", "内容ID"]
LARK_CLI_FALLBACK = (
    "/Users/juding/.workbuddy/binaries/node/cli-connector-packages/bin/lark-cli"
)


def find_lark_cli() -> str:
    for candidate in (shutil.which("lark-cli"), LARK_CLI_FALLBACK):
        if candidate and Path(candidate).exists():
            return candidate
    raise SystemExit("找不到 lark-cli；飞书拉取需要它，请确认连接器已就绪。")


def fetch_rows(lark_cli: str, timeout: int = 120) -> List[List[Any]]:
    """调 lark-cli 读工作表，返回二维数组（不含表头）。"""
    # lark-cli 限制 --output-path 必须落在 cwd / /tmp / ~/files 之下，用 /tmp
    out_path = Path("/tmp") / ("feishu-schedule-%d.json" % os.getpid())
    try:
        proc = subprocess.run(
            [
                lark_cli,
                "sheets",
                "+table-get",
                "--spreadsheet-token",
                SPREADSHEET_TOKEN,
                "--sheet-id",
                SHEET_ID,
                "--output-path",
                str(out_path),
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "").strip()
            raise SystemExit("读取飞书表格失败：%s" % detail[:400])
        payload = json.loads(out_path.read_text(encoding="utf-8"))
    finally:
        out_path.unlink(missing_ok=True)

    sheets = payload.get("sheets") or []
    if not sheets:
        raise SystemExit("飞书返回里没有工作表数据。")
    return sheets[0].get("data") or []


def write_csv(rows: List[List[Any]], dest: Path) -> int:
    written = 0
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(HEADER)
        for row in rows:
            cells = list(row) + ["", "", "", "", ""]
            planned, series, topic, title, content_id = cells[:5]
            if not any(str(c or "").strip() for c in (planned, series, topic, title)):
                continue
            writer.writerow(
                [
                    str(planned or "").strip(),
                    str(series or "").strip(),
                    str(topic or "").strip(),
                    str(title or "").strip(),
                    str(content_id or "").strip(),
                ]
            )
            written += 1
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description="从飞书数据底表拉取排期")
    parser.add_argument(
        "--project-root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    parser.add_argument("--out", type=Path, help="输出 CSV 路径，默认 imports/feishu-schedule-<日期>.csv")
    parser.add_argument("--dry-run", action="store_true", help="只拉取并报告，不写文件")
    args = parser.parse_args()

    root = args.project_root.resolve()
    lark_cli = find_lark_cli()
    rows = fetch_rows(lark_cli)

    dest = args.out or (root / "imports" / ("feishu-schedule-%s.csv" % date.today().isoformat()))
    summary = {
        "source": "feishu://数据底表/00-排期表",
        "rows": len(rows),
        "dry_run": args.dry_run,
    }
    if args.dry_run:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    summary["written"] = write_csv(rows, dest)
    summary["file"] = str(dest)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
