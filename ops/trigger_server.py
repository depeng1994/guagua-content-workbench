#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""瓜瓜内容工作台 - 本机手动触发服务。

工作台页面上的「更新数据」按钮会请求本服务，由它在本机执行
ops/run_daily.sh（采集 -> 分析 -> 同步 -> 提交推送）。

只用标准库，可跑在 /usr/bin/python3 (3.9)，不依赖项目的 collector-venv，
这样即使 venv 出问题触发服务也不会挂掉。

接口：
    GET  /         调试用的状态页（浏览器直接打开）
    GET  /status   运行状态 + 日志尾部（JSON）
    POST /trigger  触发一次采集；已在运行则返回 409
    OPTIONS *      CORS 预检（含 Private Network Access）
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PROJECT_ROOT = "/Users/juding/projects/guagua-content-workbench"
RUN_SCRIPT = os.path.join(PROJECT_ROOT, "ops", "run_daily.sh")
RUN_LOG = os.path.join(PROJECT_ROOT, "local-data", "trigger-run.log")
HOST = "127.0.0.1"
PORT = int(os.environ.get("GUAGUA_TRIGGER_PORT", "8899"))
TAIL_CHARS = 3000

_lock = threading.Lock()
_state = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "exit_code": None,
    "pid": None,
    "error": None,
    "trigger": None,  # 最近一次触发来源，便于排查
}


def _public_state() -> dict:
    with _lock:
        snap = dict(_state)
    snap["elapsed"] = None
    if snap["started_at"]:
        end = snap["finished_at"] or time.time()
        snap["elapsed"] = round(end - snap["started_at"], 1)
    snap["log_exists"] = os.path.exists(RUN_LOG)
    return snap


def _tail() -> str:
    try:
        with open(RUN_LOG, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read()[-TAIL_CHARS:]
    except OSError:
        return ""


def _start_run() -> tuple[bool, str]:
    """启动采集任务；返回 (是否新启动, 说明)。"""
    global _state
    with _lock:
        if _state["running"]:
            return False, "已有采集任务正在运行"
        if not os.path.exists(RUN_SCRIPT):
            _state["error"] = "找不到 %s" % RUN_SCRIPT
            return False, "找不到采集脚本"
        _state.update(
            running=True,
            started_at=time.time(),
            finished_at=None,
            exit_code=None,
            pid=None,
            error=None,
        )

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()
    return True, "已启动采集"


def _worker() -> None:
    """实际跑 ops/run_daily.sh，把输出落到 RUN_LOG。"""
    proc = None
    try:
        os.makedirs(os.path.dirname(RUN_LOG), exist_ok=True)
        with open(RUN_LOG, "w", encoding="utf-8") as fh:
            fh.write("== 触发采集 %s ==\n" % time.strftime("%Y-%m-%d %H:%M:%S"))
            fh.write("$ /bin/bash %s\n\n" % RUN_SCRIPT)
            fh.flush()
            proc = subprocess.Popen(
                ["/bin/bash", RUN_SCRIPT],
                cwd=PROJECT_ROOT,
                stdout=fh,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            with _lock:
                _state["pid"] = proc.pid
            code = proc.wait()
            fh.write("\n== 退出码 %s ==\n" % code)
            fh.flush()
        with _lock:
            _state.update(
                running=False,
                finished_at=time.time(),
                exit_code=code,
                pid=None,
            )
    except Exception as exc:  # noqa: BLE001 - 任何异常都要让状态回到 idle
        with _lock:
            _state.update(
                running=False,
                finished_at=time.time(),
                exit_code=-1,
                pid=None,
                error=repr(exc),
            )


def _cors(handler: BaseHTTPRequestHandler) -> None:
    """允许工作台页面（部署在公网域名上）访问本机 127.0.0.1 服务。

    Chrome 的 Private Network Access 要求公网页面访问 localhost 时，
    服务端必须在预检响应里带上 Access-Control-Allow-Private-Network。
    """
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header(
        "Access-Control-Allow-Headers",
        "Content-Type, Access-Control-Request-Private-Network",
    )
    handler.send_header("Access-Control-Allow-Private-Network", "true")
    handler.send_header("Access-Control-Max-Age", "86400")
    handler.send_header("Cache-Control", "no-store")


class Handler(BaseHTTPRequestHandler):
    server_version = "GuaguaTrigger/1.0"

    def log_message(self, fmt: str, *args) -> None:  # 精简访问日志
        sys.stderr.write(
            "%s - %s\n" % (time.strftime("%H:%M:%S"), fmt % args)
        )

    # ---------- CORS 预检 ----------
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        _cors(self)
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ---------- 查询状态 ----------
    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path == "/status":
            payload = _public_state()
            payload["tail"] = _tail()
            self._json(payload)
            return
        if path in ("/", "/index.html"):
            self._html(_status_page())
            return
        self._json({"ok": False, "error": "not found"}, status=404)

    # ---------- 触发采集 ----------
    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path != "/trigger":
            self._json({"ok": False, "error": "not found"}, status=404)
            return
        started, message = _start_run()
        payload = {
            "ok": started,
            "message": message,
            "state": _public_state(),
        }
        self._json(payload, status=200 if started else 409)

    # ---------- 响应工具 ----------
    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        _cors(self)
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def _html(self, text: str) -> None:
        body = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass


def _status_page() -> str:
    st = _public_state()
    if st["running"]:
        banner = "采集中…（已用时 %s 秒）" % st["elapsed"]
    elif st["finished_at"]:
        banner = "上次采集：退出码 %s，用时 %s 秒" % (st["exit_code"], st["elapsed"])
    else:
        banner = "空闲，尚未触发过采集"

    tail = _tail().replace("&", "&amp;").replace("<", "&lt;")
    return """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>瓜瓜工作台 · 触发服务</title>
<meta http-equiv="refresh" content="10">
<style>
body{font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
margin:40px auto;max-width:860px;color:#1f2328;padding:0 20px}
h1{font-size:18px}.badge{display:inline-block;padding:2px 10px;border-radius:999px;
background:#eef6ff;color:#1668dc;font-size:13px}
pre{background:#f6f8fa;padding:14px;border-radius:8px;overflow:auto;
max-height:60vh;font-size:12px;white-space:pre-wrap}
</style></head><body>
<h1>瓜瓜工作台 · 本机触发服务</h1>
<p><span class="badge">%s</span></p>
<p>服务地址 <code>http://%s:%s</code>。工作台的「更新数据」按钮会请求这个服务。</p>
<h2>运行日志</h2>
<pre>%s</pre>
</body></html>""" % (banner, HOST, PORT, tail or "（暂无日志）")


def main() -> int:
    if not os.path.isdir(PROJECT_ROOT):
        sys.stderr.write("项目目录不存在：%s\n" % PROJECT_ROOT)
        return 1
    os.makedirs(os.path.dirname(RUN_LOG), exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    sys.stderr.write(
        "[trigger] 监听 http://%s:%s  项目=%s\n" % (HOST, PORT, PROJECT_ROOT)
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
