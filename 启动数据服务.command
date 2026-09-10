#!/bin/bash
# 双击此文件，装入并启动「工作台 → 更新数据」按钮依赖的本机触发服务。
#
# 必须在 Finder 里双击（会自动用 Terminal.app 打开 → Aqua 会话）。
# 在 SSH / 控制台 TTY 里直接 bash 跑，launchctl 会因写权限受限报
# "Bootstrap failed: 5: Input/output error"，这和每日任务的装载器是同一个限制。
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_SRC="$DIR/ops/com.guagua.trigger.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.guagua.trigger.plist"
LABEL="com.guagua.trigger"
UID_NUM=$(id -u)

echo "== 瓜瓜 · 启动「更新数据」触发服务 =="
echo "项目：$DIR"
echo ""

# 先清掉可能占着 8899 端口的旧进程，否则 launchd 拉起的实例会反复重启
if command -v lsof >/dev/null 2>&1; then
  OLD_PID=$(lsof -ti tcp:8899 2>/dev/null || true)
  if [ -n "${OLD_PID:-}" ]; then
    echo "发现占用 8899 端口的旧进程：$OLD_PID，正在结束…"
    echo "$OLD_PID" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
fi

cp "$PLIST_SRC" "$PLIST_DST"
echo "plist 已复制到 ~/Library/LaunchAgents"
echo ""

# 清理可能残留的注册
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null
launchctl bootout "user/$UID_NUM/$LABEL" 2>/dev/null

echo "--- 注册服务 ---"
if ! launchctl bootstrap "gui/$UID_NUM" "$PLIST_DST" 2>/dev/null; then
  echo "gui 域失败，回退到 user 域…"
  if ! launchctl bootstrap "user/$UID_NUM" "$PLIST_DST" 2>/dev/null; then
    echo ""
    echo "注册失败。请确认你是在 Finder 双击本文件（Terminal.app 图形会话）里运行，"
    echo "而不是通过 SSH 或远程终端执行。"
    echo ""
    echo "按回车关闭…"
    read -r _
    exit 1
  fi
  DOMAIN="user/$UID_NUM"
else
  DOMAIN="gui/$UID_NUM"
fi

sleep 3

echo ""
echo "--- 服务状态 ---"
launchctl print "$DOMAIN/$LABEL" 2>&1 | grep -E "^\s+state|^\s+program|pid" | head -5

echo ""
echo "--- 连通性自检 ---"
if curl -s --max-time 5 "http://127.0.0.1:8899/status" >/dev/null 2>&1; then
  echo "触发服务已就绪：http://127.0.0.1:8899"
  curl -s --max-time 5 "http://127.0.0.1:8899/status" | head -c 200
  echo ""
  echo ""
  echo "现在回到工作台，点右上角的「更新数据」就能触发采集了。"
  open "http://127.0.0.1:8899/" 2>/dev/null || true
else
  echo "服务没能响应，查看日志："
  echo "  tail -50 ~/Library/Logs/guagua-trigger.log"
fi

echo ""
echo "完成，15 秒后自动关闭（或按回车立即关闭）…"
read -t 15 -r _ || true
exit 0
