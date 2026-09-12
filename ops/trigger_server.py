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
import re
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
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
    # 方案 B：采集与推送解耦。采集完成即算成功，推送在后台线程里继续重试。
    "deploying": False,     # 后台是否正在重试推送
    "deploy_error": None,   # 最近一次推送失败原因
    "deploy_attempts": 0,   # 已重试次数
}

PUSH_MAX_ATTEMPTS = 60   # 最多重试 60 次
PUSH_INTERVAL = 30       # 每次间隔 30 秒 => 最长约 30 分钟


def _ahead_count() -> int:
    """本地相对 origin/main 领先几个 commit；>0 表示还有数据没推上去。"""
    try:
        r = subprocess.run(
            ["git", "rev-list", "--count", "origin/main..HEAD"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if r.returncode == 0:
            return int(r.stdout.strip() or "0")
    except Exception:
        pass
    return 0


def _append_log(text: str) -> None:
    """把后台推送的进展追加到运行日志，前端浮层能看到。"""
    try:
        with open(RUN_LOG, "a", encoding="utf-8") as fh:
            fh.write(text)
    except OSError:
        pass


def _public_state() -> dict:
    with _lock:
        snap = dict(_state)
    snap["elapsed"] = None
    if snap["started_at"]:
        end = snap["finished_at"] or time.time()
        snap["elapsed"] = round(end - snap["started_at"], 1)
    snap["log_exists"] = os.path.exists(RUN_LOG)
    snap["ahead"] = _ahead_count()
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
        # 方案 B：采集完成即成功。若还有没推上去的 commit，交给后台线程继续重试，
        # 用户看到的是「已完成 / 部署中」，不会被代理抖动误导成采集失败。
        pending = _ahead_count()
        with _lock:
            _state.update(
                running=False,
                finished_at=time.time(),
                exit_code=code,
                pid=None,
            )
        if pending > 0:
            _append_log(
                "\n[部署中] 采集已完成，还有 %d 个提交待推送，"
                "触发服务会在后台持续重试（每 %d 秒一次）。\n" % (pending, PUSH_INTERVAL)
            )
            threading.Thread(target=_push_worker, daemon=True).start()
    except Exception as exc:  # noqa: BLE001 - 任何异常都要让状态回到 idle
        with _lock:
            _state.update(
                running=False,
                finished_at=time.time(),
                exit_code=-1,
                pid=None,
                error=repr(exc),
            )


def _listening_ports() -> list:
    """本机正在监听的 TCP 端口。用于找 WorkBuddy 那些会漂移的本地代理。"""
    ports = set()
    try:
        r = subprocess.run(
            ["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        for line in r.stdout.splitlines()[1:]:
            m = re.search(r":(\d+)\s*\(LISTEN\)", line)
            if m:
                ports.add(int(m.group(1)))
    except Exception:
        pass
    return sorted(ports)


def _proxy_candidates() -> list:
    """收集候选代理：环境变量（启动快照）→ 系统代理 → 本地监听端口。

    本机代理端口会频繁漂移（实测 62775 → 62842 → 59225 → 50500 …），
    而服务进程的环境变量是启动时的快照、不会更新，所以必须重新探测。
    """
    cands = []
    for var in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
        v = os.environ.get(var)
        if v and v not in cands:
            cands.append(v)
    try:
        out = subprocess.run(
            ["scutil", "--proxy"], capture_output=True, text=True, timeout=5
        ).stdout
        h = re.search(r"HTTPSProxy\s*:\s*(\S+)", out)
        p = re.search(r"HTTPSPort\s*:\s*(\d+)", out)
        if h and p:
            u = "http://%s:%s" % (h.group(1), p.group(1))
            if u not in cands:
                cands.append(u)
    except Exception:
        pass
    for port in _listening_ports():
        u = "http://127.0.0.1:%d" % port
        if u not in cands:
            cands.append(u)
    return cands[:14]  # 限制数量，避免探测太慢


def _proxy_works(proxy: str) -> bool:
    """用 git ls-remote 实测该代理能否连上 GitHub（和真实 push 同一条路）。"""
    env = dict(os.environ)
    env.update(HTTPS_PROXY=proxy, https_proxy=proxy, HTTP_PROXY=proxy, http_proxy=proxy)
    try:
        r = subprocess.run(
            ["git", "ls-remote", "origin", "main"],
            cwd=PROJECT_ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=15,
        )
        return r.returncode == 0
    except Exception:
        return False


def _pick_proxy():
    """并发探测候选代理，返回第一个能连上 GitHub 的；都没有则 None。"""
    cands = _proxy_candidates()
    if not cands:
        return None
    try:
        with ThreadPoolExecutor(max_workers=min(8, len(cands))) as ex:
            results = list(ex.map(_proxy_works, cands))
    except Exception:
        return None
    for c, ok in zip(cands, results):
        if ok:
            return c
    return None


def _push_worker() -> None:
    """后台持续重试 git push，直到成功或用尽次数。

    代理（127.0.0.1:xxxxx）偶发 502 甚至整个进程消失，
    所以这里要能扛住几十分钟的不可用，而不是像流水线里那样只试 5 次。
    """
    with _lock:
        if _state["deploying"]:
            return  # 已有推送线程在跑，不重复
        _state.update(deploying=True, deploy_error=None, deploy_attempts=0)

    for attempt in range(1, PUSH_MAX_ATTEMPTS + 1):
        if _ahead_count() == 0:
            with _lock:
                _state.update(deploying=False, deploy_error=None)
            _append_log("[部署中] 没有待推送的提交，跳过。\n")
            return

        # 每次都重新探测可用代理。代理端口会漂移（实测 62775→62842→59225→50500），
        # 而本进程的环境变量是启动时的快照、不会更新，直接用必然敲旧端口。
        proxy = _pick_proxy()
        env = dict(os.environ)
        if proxy:
            env.update(
                HTTPS_PROXY=proxy, https_proxy=proxy, HTTP_PROXY=proxy, http_proxy=proxy
            )

        pushed = None
        try:
            pushed = subprocess.run(
                ["git", "push", "origin", "main"],
                cwd=PROJECT_ROOT,
                env=env,
                capture_output=True,
                text=True,
                timeout=300,
            )
            err = (pushed.stderr or pushed.stdout or "").strip()
        except Exception as exc:  # noqa: BLE001
            err = repr(exc)

        if pushed is not None and pushed.returncode == 0:
            with _lock:
                _state.update(
                    deploying=False, deploy_error=None, deploy_attempts=attempt
                )
            _append_log(
                "[部署中] 第 %d 次重试成功（代理 %s），已推送到 origin/main。\n"
                % (attempt, proxy or "环境变量")
            )
            return

        with _lock:
            _state.update(deploying=True, deploy_error=err, deploy_attempts=attempt)
        _append_log(
            "[部署中] 第 %d 次重试失败（代理 %s）：%s\n"
            % (attempt, proxy or "环境变量/未找到可用代理", err[:160])
        )
        time.sleep(PUSH_INTERVAL)

    with _lock:
        _state.update(deploying=False)
    _append_log(
        "[部署中] 已重试 %d 次仍未成功，稍后可再次点击「更新数据」，"
        "或在项目目录手动执行 git push origin main。\n" % PUSH_MAX_ATTEMPTS
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
