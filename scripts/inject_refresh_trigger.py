#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 ops/refresh-trigger.js 内联进 index.html 的 </body> 之前。

做成幂等：用注释标记包裹，重复执行只会替换，不会叠加。
sync_content_master.py 只替换 RSC chunk，不会动这段，所以数据同步后按钮仍然在。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
SOURCE = ROOT / "ops" / "refresh-trigger.js"

START = "<!-- guagua-refresh-trigger:start -->"
END = "<!-- guagua-refresh-trigger:end -->"
PATTERN = re.compile(
    re.escape(START) + r".*?" + re.escape(END),
    re.DOTALL,
)


def main() -> int:
    if not SOURCE.exists():
        print("找不到 %s" % SOURCE, file=sys.stderr)
        return 1
    html = INDEX.read_text(encoding="utf-8")
    js = SOURCE.read_text(encoding="utf-8")
    block = "%s\n<script>\n%s\n</script>\n%s" % (START, js, END)

    if PATTERN.search(html):
        html = PATTERN.sub(lambda _m: block, html, count=1)
        action = "已替换"
    elif "</body>" in html:
        html = html.replace("</body>", block + "\n</body>", 1)
        action = "已注入"
    else:
        html = html + "\n" + block + "\n"
        action = "已追加"

    INDEX.write_text(html, encoding="utf-8")
    print("%s %s（%d 字节脚本）" % (action, INDEX.name, len(js)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
