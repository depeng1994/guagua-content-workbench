#!/bin/bash
# launchd 的包装脚本：plist 用这个作为 Program 入口。
# launchd 在 GUI 域不允许 Program 本身是软链，所以这里把它变成真实文件，
# 内部再去 exec 那个 venv 软链（exec 跟软链是允许的）。
set -eu
DIR="/Users/juding/Desktop/AI工程目录/04 企业解读/guagua-content-workbench"
exec "$DIR/local-data/collector-venv/bin/python" \
    "$DIR/scripts/daily_run.py" \
    --project-root "$DIR" \
    --collect \
    --push
