# 瓜瓜看经营 · 内容工作台

GitHub Pages 静态工作台，包含内容排期与由本地小红书创作者后台数据驱动的数据复盘。PHASE 1 已完成导入、私有每日快照、指标分析和前端 JSON 接入；PHASE 2 已接入 Playwright 本地登录态复用与采集。

## 快速开始

环境要求：macOS / Python 3.9+。

```bash
cd guagua-content-workbench
python3 -m pip install -r requirements.txt  # 仅 Excel 需要；CSV 可跳过
python3 scripts/import_xhs_export.py ./imports
python3 -m http.server 8000
```

浏览器打开 `http://localhost:8000`，进入「数据与复盘」。

导入命令会依次完成：读取 CSV/Excel、字段标准化、校验、保存当天快照、计算 derived JSON、刷新工作台数据源。

## 手工导入

把官方导出文件放入 `imports/`。支持单个文件或整个目录：

```bash
python3 scripts/import_xhs_export.py ./imports
python3 scripts/import_xhs_export.py ./downloads/xhs-notes.xlsx --date 2026-09-08
```

CSV / Excel 支持多个常见中英文字段别名。参考：

- `imports/account.example.csv`
- `imports/notes.example.csv`
- `data/schema/*.schema.json`

已有同日快照时：内容完全相同则跳过；内容不同则整批失败，绝不覆盖历史数据。

## 数据目录

```text
data/
  content/content-master.json       # 唯一公开内容主表
  schema/                           # 数据契约
  derived/                          # 可公开、前端只读的分析结果
local-data/raw/                     # 私有账号/笔记快照，Git 忽略
imports/                            # 原始导出文件，Git 忽略示例之外的文件
scripts/
  import_xhs_export.py              # 一条命令完成导入和分析
  analyze.py                        # 仅重新计算 derived
  guagua_pipeline.py                # 标准化、校验与核心计算
  sync_content_master.py            # 从主表刷新旧排期 UI 的兼容快照
  sanitize_public_snapshot.py       # 发布前清理内嵌后台原始数据
tests/
collector/                           # PHASE 2 本地登录与采集
```

## 数据模型与口径

内容主表包含：`content_id`、`publish_date`、`series`、`topic`、`title`、`status`、`xiaohongshu_note_id`、`xiaohongshu_url`、`content_type`、`title_type`、`industry`、`tags`。

账号快照记录 `metric_window`（`daily`、`period_total`、`cumulative` 或 `unknown`）以及可选的 `period_start` / `period_end`。近 7 日 KPI 只会汇总完整的 7 个单日快照，或直接使用日期范围完全匹配的 7 日区间合计；不会把滚动周期值重复相加。笔记快照保存累计指标。后台不存在的字段保持 `null`，不使用 0 伪造。分析包含：

- 24h / 72h / 7d / 30d 生命周期指标与转化率；只使用目标窗口附近的快照，过晚补采不会冒充该窗口数据。
- 相邻快照新增曝光、阅读、互动和涨粉；累计值下降时增量为 `null` 并记录 warning。
- 按系列、内容类型、标题类型、行业汇总；输出 `sample_size`。
- 同生命周期窗口内容排行，避免旧内容因累计时间更长而天然领先。
- 长尾能力：`(7d 阅读 - 72h 阅读) / 7d 阅读`。
- 规则式每日洞察，最多 5 条，不依赖 LLM API。

时间统一使用 `Asia/Shanghai`，日期使用 `YYYY-MM-DD`。

修改排期时只维护 `data/content/content-master.json`，随后运行：

```bash
python3 scripts/sync_content_master.py
```

该兼容脚本会刷新 `index.html` 中现有静态排期 UI 所需的只读快照，并同时确保原始后台指标与私密链接不会被重新嵌入。

## 重新分析与测试

```bash
python3 scripts/analyze.py
python3 -m unittest discover -s tests -v
```

## 数据安全

仓库与 GitHub Pages 是公开的。默认行为：

- 原始导出与标准化每日快照只写入 `local-data/raw/`，不提交 GitHub。
- Cookie、浏览器 profile、session、凭证、日志、下载和本地配置均被 `.gitignore` 排除。
- 前端只读取 `data/derived/*.json`，不会从浏览器访问小红书。
- 不在代码中保存账号、密码、Cookie 或 token。
- `downloads/guagua-feishu-tables-20260907.xlsx` 是不含真实数据的空白导入模板；真实导出文件只保留在被忽略的本地目录。

仅在明确接受公开原始数据风险时，才可设置 `PUBLISH_RAW_DATA=true`；默认永远为 false。

## 部署

保持现有 GitHub Pages 静态发布方式：提交 `data/content/`、`data/derived/`、`assets/`、脚本和文档后，Pages 会发布更新。无需新增构建流程。

## 阶段边界

当前已完成 PHASE 1 与 PHASE 2。PHASE 2 只在本机复用人工登录态采集，不绕过验证码或风控；详细用法见 `collector/README.md`。launchd 定时运行与自动 Git 提交属于 PHASE 3，尚未实现。详细审计见 `TECHNICAL_PLAN.md`。
