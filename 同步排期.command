#!/bin/bash
# 双击运行：把飞书排期表导出成 CSV/Excel 放进 imports/ 后，一键同步到工作台并发布。
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1

PY="$DIR/local-data/collector-venv/bin/python"
[ -x "$PY" ] || PY="python3"

echo "== 瓜瓜看经营 · 排期同步 =="
echo "仓库：$DIR"
echo ""
echo "使用方法："
echo "  1. 在飞书打开排期表，导出为 CSV 或 Excel"
echo "  2. 把文件放进 imports/ 目录"
echo "  3. 回到这里按回车"
echo ""
echo "不指定文件时，会自动使用 imports/ 下最新的一份。"
echo ""
read -r -p "准备好后按回车开始，或按 Ctrl+C 取消... "

"$PY" scripts/sync_feishu_schedule.py --add-new --push
STATUS=$?

echo ""
if [ "$STATUS" -eq 0 ]; then
  echo "完成：排期已同步并推送到 GitHub Pages（约 1 分钟后生效）。"
else
  echo "未完成（退出码 $STATUS），请查看上方报错信息。"
fi
echo ""
read -r -p "按回车关闭窗口..."
