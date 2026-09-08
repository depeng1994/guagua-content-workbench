#!/usr/bin/env python3
"""Regenerate public derived JSON from local normalized snapshots."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from guagua_pipeline import PipelineError, analyze


def main() -> int:
    parser = argparse.ArgumentParser(description="计算内容生命周期、排行、系列表现与每日洞察")
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        print(json.dumps(analyze(args.project_root.resolve()), ensure_ascii=False, indent=2))
        return 0
    except PipelineError as exc:
        print(f"分析失败：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
