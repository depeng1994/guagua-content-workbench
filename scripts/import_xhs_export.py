#!/usr/bin/env python3
"""Import official XHS creator CSV/Excel exports and refresh derived JSON."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from guagua_pipeline import DuplicateSnapshotError, PipelineError, analyze, import_exports


def main() -> int:
    parser = argparse.ArgumentParser(description="导入小红书创作者后台导出文件并刷新工作台数据")
    parser.add_argument("source", type=Path, help="CSV/Excel 文件，或包含导出文件的目录")
    parser.add_argument("--date", help="缺少采集日期时使用的日期（YYYY-MM-DD，默认北京时间今天）")
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--no-analyze", action="store_true", help="只导入，不生成 derived JSON")
    parser.add_argument("--overwrite", action="store_true", help="同日快照内容不同也覆盖（每日刷新用；手动导入默认保留历史）")
    args = parser.parse_args()
    try:
        imported = import_exports(args.project_root.resolve(), args.source.resolve(), args.date, overwrite=args.overwrite)
        result = {"import": imported}
        if not args.no_analyze:
            result["analysis"] = analyze(args.project_root.resolve())
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (PipelineError, DuplicateSnapshotError) as exc:
        print(f"导入失败：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
