#!/usr/bin/env python3
"""Collect Xiaohongshu creator data locally with Playwright.

Design goals:
- Prefer official CSV/Excel export from creator.xiaohongshu.com.
- Reuse a local persistent browser profile; never store credentials in Git.
- Fall back to visible table / metric-card extraction when no export is exposed.
- Feed importable files into the existing PHASE 1 pipeline.
- Never bypass login, captcha, anti-bot, or risk-control challenges.

Typical first run:
    python3 collector/collect_xhs.py --headed --debug

Later runs after the login state is persisted:
    python3 collector/collect_xhs.py
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo

try:
    from playwright.sync_api import (
        BrowserContext,
        Locator,
        Page,
        TimeoutError as PlaywrightTimeoutError,
        sync_playwright,
    )
except ImportError as exc:  # pragma: no cover - user-facing setup failure
    raise SystemExit(
        "缺少 Playwright。请先运行：\n"
        "  python3 -m pip install -r collector/requirements.txt\n"
        "  python3 -m playwright install chromium"
    ) from exc


SHANGHAI = ZoneInfo("Asia/Shanghai")
NUMBER_RE = re.compile(r"(?<![\d.])([+-]?[\d,，]+(?:\.\d+)?(?:万|w|W)?)(?![\d.])")
IMPORTABLE_SUFFIXES = {".csv", ".xlsx", ".xlsm", ".xls"}


class CollectorError(RuntimeError):
    """A user-facing collection failure."""


def now_shanghai() -> datetime:
    return datetime.now(SHANGHAI)


def today_iso() -> str:
    return now_shanghai().date().isoformat()


def timestamp_slug() -> str:
    return now_shanghai().strftime("%H%M%S")


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_csv(path: Path, rows: Sequence[Mapping[str, Any]]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    headers: List[str] = []
    seen = set()
    for row in rows:
        for key in row:
            if key not in seen:
                seen.add(key)
                headers.append(key)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def clean_filename(value: str, fallback: str) -> str:
    value = re.sub(r"[\\/:*?\"<>|]+", "-", value.strip())
    value = re.sub(r"\s+", "-", value).strip(".-")
    return value[:120] or fallback


def normalize_header(value: str) -> str:
    return re.sub(r"[\s_\-（）()\/]+", "", (value or "").strip().lower())


def parse_display_number(text: str) -> Optional[float]:
    match = NUMBER_RE.search(text.replace(" ", ""))
    if not match:
        return None
    token = match.group(1).replace(",", "").replace("，", "")
    multiplier = 1.0
    if token.lower().endswith("w"):
        multiplier = 10000.0
        token = token[:-1]
    elif token.endswith("万"):
        multiplier = 10000.0
        token = token[:-1]
    try:
        value = float(token) * multiplier
    except ValueError:
        return None
    return int(value) if value.is_integer() else value


def log(message: str) -> None:
    print(f"[{now_shanghai().strftime('%H:%M:%S')}] {message}", flush=True)


def visible(locator: Locator) -> bool:
    try:
        return locator.count() > 0 and locator.first.is_visible(timeout=800)
    except Exception:
        return False


def text_locator(page: Page, text: str) -> Locator:
    # Exact text first keeps clicks deterministic; the fallback supports small copy changes.
    exact = page.get_by_text(text, exact=True)
    if exact.count() > 0:
        return exact.first
    return page.get_by_text(re.compile(re.escape(text), re.I)).first


def click_candidate(page: Page, candidates: Iterable[str], timeout_ms: int = 3500) -> Optional[str]:
    for text in candidates:
        locator = text_locator(page, text)
        if not visible(locator):
            continue
        try:
            locator.click(timeout=timeout_ms)
            page.wait_for_timeout(900)
            log(f"已点击：{text}")
            return text
        except Exception:
            continue
    return None


def has_any_text(page: Page, markers: Iterable[str]) -> bool:
    for marker in markers:
        try:
            if page.get_by_text(re.compile(re.escape(marker))).count() > 0:
                return True
        except Exception:
            pass
    return False


def is_login_page(page: Page, config: Mapping[str, Any]) -> bool:
    url = page.url.lower()
    if "/login" in url or "passport" in url:
        return True
    return has_any_text(page, config.get("login_markers", [])) and not has_any_text(
        page, config.get("logged_in_markers", [])
    )


def wait_for_manual_login(page: Page, config: Mapping[str, Any], headed: bool, timeout_s: int) -> None:
    if not is_login_page(page, config):
        return
    if not headed:
        raise CollectorError(
            "当前浏览器 profile 尚未登录小红书。请先用 --headed 运行一次并人工完成登录/验证码。"
        )
    log("检测到登录页。请在打开的浏览器中人工完成登录；程序不会绕过验证码或风控。")
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        page.wait_for_timeout(1000)
        if not is_login_page(page, config):
            log("登录状态已确认。")
            return
    raise CollectorError(f"等待登录超过 {timeout_s} 秒。请重新运行并完成登录。")


def save_debug(page: Page, debug_dir: Path, name: str) -> None:
    debug_dir.mkdir(parents=True, exist_ok=True)
    try:
        page.screenshot(path=str(debug_dir / f"{name}.png"), full_page=True)
    except Exception:
        pass
    try:
        # Stored only under local-data/. Do not commit this HTML; it may contain private data.
        (debug_dir / f"{name}.html").write_text(page.content(), encoding="utf-8")
    except Exception:
        pass


def navigate_to_section(page: Page, config: Mapping[str, Any], section: str) -> Dict[str, Any]:
    nav = config.get("navigation", {})
    clicked: List[str] = []
    if section in {"account", "notes"}:
        first = click_candidate(page, nav.get("data_center", []))
        if first:
            clicked.append(first)
    second = click_candidate(page, nav.get(section, []))
    if second:
        clicked.append(second)
    page.wait_for_timeout(1200)
    return {"section": section, "url": page.url, "clicked": clicked}


def save_download(download: Any, target_dir: Path, prefix: str) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    suggested = clean_filename(download.suggested_filename or "export", "export")
    destination = target_dir / f"{prefix}-{suggested}"
    counter = 2
    while destination.exists():
        destination = target_dir / f"{prefix}-{counter}-{suggested}"
        counter += 1
    download.save_as(str(destination))
    log(f"已下载官方导出：{destination.name}")
    return destination


def try_expect_download(page: Page, locator: Locator, target_dir: Path, prefix: str) -> Optional[Path]:
    try:
        with page.expect_download(timeout=4500) as info:
            locator.click(timeout=3500)
        return save_download(info.value, target_dir, prefix)
    except PlaywrightTimeoutError:
        return None
    except Exception:
        return None


def try_official_export(
    page: Page,
    config: Mapping[str, Any],
    target_dir: Path,
    prefix: str,
    dry_run: bool,
) -> Tuple[Optional[Path], List[str]]:
    discovered: List[str] = []
    for label in config.get("export_triggers", []):
        locator = text_locator(page, label)
        if not visible(locator):
            continue
        discovered.append(label)
        if dry_run:
            continue
        downloaded = try_expect_download(page, locator, target_dir, prefix)
        if downloaded:
            return downloaded, discovered

        # Some creator dashboards open a menu/dialog first, then require a second click.
        page.wait_for_timeout(700)
        for action in config.get("download_actions", []):
            action_locator = text_locator(page, action)
            if not visible(action_locator):
                continue
            discovered.append(action)
            downloaded = try_expect_download(page, action_locator, target_dir, prefix)
            if downloaded:
                return downloaded, discovered
    return None, discovered


def extract_html_tables(page: Page) -> List[Dict[str, Any]]:
    tables: List[Dict[str, Any]] = []
    candidates = page.locator("table, [role='table']")
    count = min(candidates.count(), 20)
    for table_index in range(count):
        table = candidates.nth(table_index)
        if not table.is_visible():
            continue
        rows: List[List[str]] = []
        row_locators = table.locator("tr, [role='row']")
        for row_index in range(min(row_locators.count(), 500)):
            row = row_locators.nth(row_index)
            cells = row.locator("th, td, [role='columnheader'], [role='cell'], [role='gridcell']")
            values: List[str] = []
            for cell_index in range(min(cells.count(), 80)):
                try:
                    values.append(" ".join(cells.nth(cell_index).inner_text().split()))
                except Exception:
                    values.append("")
            if any(values):
                rows.append(values)
        if len(rows) >= 2:
            tables.append({"index": table_index, "rows": rows})
    return tables


def table_to_rows(rows: Sequence[Sequence[str]]) -> List[Dict[str, str]]:
    if len(rows) < 2:
        return []
    headers = [value.strip() or f"column_{index + 1}" for index, value in enumerate(rows[0])]
    result = []
    for values in rows[1:]:
        padded = list(values) + [""] * max(0, len(headers) - len(values))
        result.append(dict(zip(headers, padded[: len(headers)])))
    return result


def score_headers(headers: Iterable[str], config: Mapping[str, Any]) -> int:
    known = {normalize_header(item) for item in config.get("recognized_headers", [])}
    return sum(normalize_header(header) in known for header in headers)


def export_visible_tables(
    page: Page,
    config: Mapping[str, Any],
    output_dir: Path,
    section: str,
) -> Tuple[List[Path], Path]:
    tables = extract_html_tables(page)
    raw_path = output_dir / f"visible-{section}-tables.json"
    write_json(raw_path, {"section": section, "url": page.url, "tables": tables})
    importable: List[Path] = []
    for item in tables:
        rows = table_to_rows(item["rows"])
        if not rows:
            continue
        if score_headers(rows[0].keys(), config) < 2:
            continue
        path = output_dir / f"visible-{section}-table-{item['index'] + 1}.csv"
        write_csv(path, rows)
        importable.append(path)
    return importable, raw_path


def nearest_numeric_text(locator: Locator) -> Optional[float]:
    current = locator
    for _ in range(4):
        try:
            text = " ".join(current.inner_text().split())
        except Exception:
            text = ""
        if text:
            matches = NUMBER_RE.findall(text)
            # Prefer the last number; dashboard cards often render label before value.
            for token in reversed(matches):
                value = parse_display_number(token)
                if value is not None:
                    return value
        try:
            current = current.locator("xpath=..")
        except Exception:
            break
    return None


def extract_account_metric_cards(page: Page, config: Mapping[str, Any], snapshot_date: str) -> Dict[str, Any]:
    row: Dict[str, Any] = {"快照日期": snapshot_date, "统计口径": "unknown"}
    for canonical, labels in config.get("account_metric_labels", {}).items():
        value = None
        for label in labels:
            locator = text_locator(page, label)
            if not visible(locator):
                continue
            value = nearest_numeric_text(locator)
            if value is not None:
                break
        if value is not None:
            row[canonical] = value
    return row


def write_account_fallback(
    page: Page,
    config: Mapping[str, Any],
    output_dir: Path,
    snapshot_date: str,
) -> Optional[Path]:
    row = extract_account_metric_cards(page, config, snapshot_date)
    metric_count = len(row) - 2
    if metric_count <= 0:
        return None
    path = output_dir / "visible-account-metrics.csv"
    write_csv(path, [row])
    log(f"未发现官方导出，已从页面可见指标生成本地回退文件：{path.name}")
    return path


def unpack_archives(output_dir: Path) -> List[Path]:
    extracted: List[Path] = []
    for archive in list(output_dir.glob("*.zip")):
        target = output_dir / f"{archive.stem}-unzipped"
        target.mkdir(exist_ok=True)
        try:
            with zipfile.ZipFile(archive) as handle:
                handle.extractall(target)
        except (zipfile.BadZipFile, OSError):
            continue
        for path in target.rglob("*"):
            if path.is_file() and path.suffix.lower() in IMPORTABLE_SUFFIXES:
                destination = output_dir / f"unzipped-{clean_filename(path.name, 'export.csv')}"
                shutil.copy2(path, destination)
                extracted.append(destination)
    return extracted


def importable_files(output_dir: Path) -> List[Path]:
    files = [path for path in output_dir.iterdir() if path.is_file() and path.suffix.lower() in IMPORTABLE_SUFFIXES]
    return sorted(files)


def run_phase1_import(project_root: Path, output_dir: Path, snapshot_date: str) -> Dict[str, Any]:
    command = [
        sys.executable,
        str(project_root / "scripts" / "import_xhs_export.py"),
        str(output_dir),
        "--date",
        snapshot_date,
        "--project-root",
        str(project_root),
    ]
    log("开始调用 PHASE 1 标准化与分析流水线。")
    completed = subprocess.run(command, cwd=project_root, text=True, capture_output=True)
    result = {
        "returncode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }
    if completed.returncode != 0:
        raise CollectorError("PHASE 1 导入失败：\n" + (completed.stderr.strip() or completed.stdout.strip()))
    return result


def open_context(playwright: Any, profile: Path, headed: bool, browser_choice: str) -> BrowserContext:
    profile.mkdir(parents=True, exist_ok=True)
    launch_args: Dict[str, Any] = {
        "user_data_dir": str(profile),
        "headless": not headed,
        "accept_downloads": True,
        "locale": "zh-CN",
        "timezone_id": "Asia/Shanghai",
        "viewport": {"width": 1440, "height": 1000},
    }
    if browser_choice == "chrome":
        launch_args["channel"] = "chrome"
    return playwright.chromium.launch_persistent_context(**launch_args)


def collect_section(
    page: Page,
    section: str,
    config: Mapping[str, Any],
    output_dir: Path,
    debug_dir: Path,
    snapshot_date: str,
    dry_run: bool,
    debug: bool,
) -> Dict[str, Any]:
    nav = navigate_to_section(page, config, section)
    if debug:
        save_debug(page, debug_dir, section)
    official, discovered = try_official_export(page, config, output_dir, section, dry_run)
    result: Dict[str, Any] = {
        "navigation": nav,
        "export_controls_seen": discovered,
        "official_export": str(official) if official else None,
        "fallback_files": [],
    }
    if dry_run:
        return result
    if official:
        return result

    fallback_files, raw_path = export_visible_tables(page, config, output_dir, section)
    result["raw_visible_tables"] = str(raw_path)
    result["fallback_files"].extend(str(path) for path in fallback_files)
    if section == "account":
        metric_file = write_account_fallback(page, config, output_dir, snapshot_date)
        if metric_file:
            result["fallback_files"].append(str(metric_file))
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="本地采集小红书创作者后台数据并接入瓜瓜看经营工作台")
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--profile", type=Path, default=Path.home() / ".guagua" / "xhs-browser-profile")
    parser.add_argument("--output", type=Path, help="本次私有采集输出目录；默认 local-data/collector/inbox/<date>/<time>")
    parser.add_argument("--date", default=today_iso(), help="采集日期，默认 Asia/Shanghai 今天")
    parser.add_argument("--headed", action="store_true", help="显示浏览器；首次登录必须使用")
    parser.add_argument("--dry-run", action="store_true", help="只检查登录、导航和导出入口，不下载、不导入")
    parser.add_argument("--debug", action="store_true", help="保存本地截图和 HTML 调试材料（local-data，Git 忽略）")
    parser.add_argument("--no-import", action="store_true", help="只采集文件，不调用 PHASE 1 导入/分析")
    parser.add_argument("--skip-account", action="store_true")
    parser.add_argument("--skip-notes", action="store_true")
    parser.add_argument("--login-timeout", type=int, default=300, help="首次人工登录最长等待秒数")
    parser.add_argument("--browser", choices=["chromium", "chrome"], default="chromium")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    project_root = args.project_root.expanduser().resolve()
    config_path = project_root / "collector" / "selectors.json"
    if not config_path.exists():
        print(f"采集失败：缺少 {config_path}", file=sys.stderr)
        return 2
    config = load_json(config_path)

    snapshot_date = args.date
    try:
        datetime.strptime(snapshot_date, "%Y-%m-%d")
    except ValueError:
        print("采集失败：--date 必须是 YYYY-MM-DD", file=sys.stderr)
        return 2

    if args.output:
        output_dir = args.output.expanduser().resolve()
    else:
        output_dir = project_root / "local-data" / "collector" / "inbox" / snapshot_date / timestamp_slug()
    output_dir.mkdir(parents=True, exist_ok=True)
    debug_dir = output_dir / "debug"

    manifest: Dict[str, Any] = {
        "schema_version": "1.0",
        "collected_at": now_shanghai().replace(microsecond=0).isoformat(),
        "snapshot_date": snapshot_date,
        "profile": str(args.profile.expanduser()),
        "output_dir": str(output_dir),
        "dry_run": args.dry_run,
        "sections": {},
        "import": None,
        "warnings": [],
    }

    try:
        with sync_playwright() as playwright:
            context = open_context(playwright, args.profile.expanduser(), args.headed, args.browser)
            try:
                pages = context.pages
                page = pages[0] if pages else context.new_page()
                log(f"打开小红书创作服务平台：{config['home_url']}")
                page.goto(config["home_url"], wait_until="domcontentloaded", timeout=45000)
                wait_for_manual_login(page, config, args.headed, args.login_timeout)
                page.goto(config["home_url"], wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(1200)
                if is_login_page(page, config):
                    raise CollectorError("登录后仍被重定向到登录页，请重新完成登录。")
                if args.debug:
                    save_debug(page, debug_dir, "home")

                if not args.skip_account:
                    manifest["sections"]["account"] = collect_section(
                        page, "account", config, output_dir, debug_dir, snapshot_date, args.dry_run, args.debug
                    )
                    page.goto(config["home_url"], wait_until="domcontentloaded", timeout=45000)
                    page.wait_for_timeout(900)

                if not args.skip_notes:
                    manifest["sections"]["notes"] = collect_section(
                        page, "notes", config, output_dir, debug_dir, snapshot_date, args.dry_run, args.debug
                    )
            finally:
                context.close()

        if not args.dry_run:
            unpack_archives(output_dir)
            files = importable_files(output_dir)
            manifest["importable_files"] = [str(path) for path in files]
            if not files:
                manifest["warnings"].append(
                    "没有采集到可供 PHASE 1 导入的 CSV/Excel；请用 --headed --debug 检查页面入口或更新 collector/selectors.json。"
                )
            elif not args.no_import:
                manifest["import"] = run_phase1_import(project_root, output_dir, snapshot_date)

        write_json(output_dir / "manifest.json", manifest)
        log(f"采集完成。私有结果：{output_dir}")
        if args.dry_run:
            log("dry-run 未下载文件、未写入快照。")
        elif manifest.get("import"):
            log("PHASE 1 导入与 derived 分析已完成。")
        return 0
    except (CollectorError, PlaywrightTimeoutError) as exc:
        manifest["error"] = str(exc)
        write_json(output_dir / "manifest.json", manifest)
        print(f"采集失败：{exc}", file=sys.stderr)
        print(f"调试信息目录：{output_dir}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
