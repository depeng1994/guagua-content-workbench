#!/bin/bash
# 双击此文件即可注册每日 9 点的 launchd 任务。
# 必须在 Finder 双击（自动打开 Terminal.app → Aqua 会话），
# 在控制台 TTY 里直接 bash 跑会因为 launchctl 写权限受限而失败。
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_SRC="$DIR/ops/com.guagua.daily.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.guagua.daily.plist"
UID_NUM=$(id -u)

echo "== 瓜瓜 · 每日任务装载器 =="
echo "源：$PLIST_SRC"
echo "目标：$PLIST_DST"
echo ""

cp "$PLIST_SRC" "$PLIST_DST"
echo "plist 已复制。"
echo ""

# 清理可能残留
launchctl bootout "gui/$UID_NUM/com.guagua.daily" 2>/dev/null
launchctl bootout "user/$UID_NUM/com.guagua.daily" 2>/dev/null

# 注册到 gui 域（需要你在图形登录状态）
echo "--- 注册到 gui 域 ---"
if ! launchctl bootstrap "gui/$UID_NUM" "$PLIST_DST"; then
  echo "gui 域失败，回退到 user 域…"
  if ! launchctl bootstrap "user/$UID_NUM" "$PLIST_DST"; then
    echo ""
    echo "两个域都注册失败。可能是 launchd 写入受限。"
    echo "请确认你在 Terminal.app（图形）里执行此脚本，而不是 SSH / 控制台 TTY。"
    echo "或运行：sudo launchctl bootstrap system \"$PLIST_DST\""
    exit 1
  fi
  DOMAIN="user/$UID_NUM"
else
  DOMAIN="gui/$UID_NUM"
fi

echo ""
echo "--- 状态 ---"
launchctl print "$DOMAIN/com.guagua.daily" 2>&1 | grep -E "^state|^program" | head -4

echo ""
echo "--- 立刻试跑一次（不用等明早 9 点） ---"
launchctl kickstart -k "$DOMAIN/com.guagua.daily"
echo "已触发。日志：/Users/juding/Library/Logs/guagua-daily.log"
echo ""
echo "完成。按回车关闭…"
read -r _
