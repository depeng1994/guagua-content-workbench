#!/usr/bin/env python3
"""PHASE 3 每日编排：采集 -> 导入 -> 翻转发布状态 -> 分析 -> 同步排期 -> 提交推送。

每一段都调用仓库里已有的脚本，不重复实现逻辑。任一步失败即中止，
避免把半成品推到 GitHub Pages。

常用::

    python3 scripts/daily_run.py                       # 只跑「已采集数据」之后的处理
    python3 scripts/daily_run.py --collect             # 含采集（无头，需已登录）
    python3 scripts/daily_run.py --collect --headed    # 首次/重新登录时用
    python3 scripts/daily_run.py --push                # 跑完自动 commit + push
    python3 scripts/daily_run.py --collect --push      # launchd 每日正式用法

排期（人来维护的部分）不在这里更新，请用 scripts/sync_feishu_schedule.py。
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import List, Optional, Sequence

SCRIPTS = Path(__file__).resolve().parent


class StepError(RuntimeError):
    pass


def run_step(name: str, cmd: Sequence[str], cwd: Path) -> None:
    print(f"\n=== {name} ===")
    print("$ " + " ".join(str(part) for part in cmd))
    result = subprocess.run(list(cmd), cwd=str(cwd))
    if result.returncode != 0:
        raise StepError(f"步骤「{name}」失败，退出码 {result.returncode}")


def resolve_python(root: Path, override: Optional[str]) -> str:
    """launchd 的 PATH 很干净，优先用采集器 venv（含 playwright 与 openpyxl）。"""
    if override:
        return override
    venv = root / "local-data" / "collector-venv" / "bin" / "python"
    if venv.exists():
        return str(venv)
    return sys.executable or "python3"


def git(cwd: Path, args: Sequence[str]) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=str(cwd), capture_output=True, text=True)


def commit_and_push(cwd: Path, when: str, remote: str, branch: str) -> None:
    status = git(cwd, ["status", "--porcelain", "data", "index.html"])
    if not status.stdout.strip():
        print("\n=== 提交 ===\n没有需要提交的改动。")
        return

    git(cwd, ["add", "data", "index.html"])
    message = f"chore(daily): {when} 数据刷新"
    committed = git(cwd, ["commit", "-m", message])
    if committed.returncode != 0:
        raise StepError(f"提交失败：{committed.stderr.strip()}")
    print(f"\n=== 提交 ===\n{committed.stdout.strip()}")

    pushed = git(cwd, ["push", remote, branch])
    if pushed.returncode != 0:
        raise StepError(f"推送失败：{pushed.stderr.strip()}")
    print(pushed.stdout.strip() or "(pushed)")


def main() -> int:
    parser = argparse.ArgumentParser(description="每日数据刷新编排")
    parser.add_argument("--project-root", type=Path, default=SCRIPTS.parent)
    parser.add_argument("--collect", action="store_true", help="先运行采集器")
    parser.add_argument("--headed", action="store_true", help="采集时显示浏览器（首次登录用）")
    parser.add_argument("--import-path", type=Path, help="导入指定导出文件或目录，跳过采集")
    parser.add_argument("--date", help="导入使用的日期（YYYY-MM-DD）")
    parser.add_argument("--push", action="store_true", help="跑完自动 commit + push")
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--branch", default="main")
    parser.add_argument("--python", help="运行子脚本的解释器，默认优先使用采集器 venv")
    parser.add_argument(
        "--browser",
        choices=["chromium", "chrome"],
        default="chrome",
        help="采集使用的浏览器；默认本机 Chrome，避免依赖 playwright 下载的 chromium",
    )
    args = parser.parse_args()

    root = args.project_root.resolve()
    python = resolve_python(root, args.python)
    when = args.date or date.today().isoformat()

    steps: List[str] = []

    try:
        if args.collect:
            cmd = [python, str(root / "collector" / "collect_xhs.py"), "--browser", args.browser]
            if args.headed:
                cmd.append("--headed")
            run_step("采集创作者后台", cmd, root)
            steps.append("collect")

        if args.import_path:
            cmd = [python, str(root / "scripts" / "import_xhs_export.py"), str(args.import_path)]
            if args.date:
                cmd += ["--date", args.date]
            run_step("导入导出文件", cmd, root)
            steps.append("import")

        run_step(
            "翻转发布状态",
            [python, str(SCRIPTS / "apply_publication_status.py"), "--project-root", str(root)],
            root,
        )
        steps.append("publication-status")

        run_step(
            "重算分析数据",
            [python, str(SCRIPTS / "analyze.py"), "--project-root", str(root)],
            root,
        )
        steps.append("analyze")

        run_step(
            "同步排期到工作台",
            [python, str(SCRIPTS / "sync_content_master.py"), "--project-root", str(root)],
            root,
        )
        steps.append("sync-schedule")

        run_step(
            "清理公开快照",
            [python, str(SCRIPTS / "sanitize_public_snapshot.py"), "--project-root", str(root)],
            root,
        )
        steps.append("sanitize")

        if args.push:
            commit_and_push(root, when, args.remote, args.branch)
            steps.append("push")

    except StepError as exc:
        print(f"\n[中止] {exc}", file=sys.stderr)
        print(f"已完成步骤：{', '.join(steps) or '无'}", file=sys.stderr)
        return 1

    print(f"\n[完成] {when} 数据刷新，步骤：{', '.join(steps)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
