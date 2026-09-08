# PHASE 2｜小红书创作者后台本地采集

本目录负责把“小红书创作服务平台 → 本地私有采集 → PHASE 1 导入/分析”串起来。

## 设计边界

- 运行位置：你的 Mac，本地运行，不在 GitHub Actions 中登录小红书。
- 登录态：默认保存在 `~/.guagua/xhs-browser-profile`，不进入仓库。
- 数据源优先级：官方 CSV/Excel 导出 > 页面可见表格 > 页面可见账号指标卡。
- 不绕过验证码、风控、反爬或登录保护；遇到登录验证时必须人工完成。
- 原始导出、截图、HTML、manifest 都写入 `local-data/`，已被 `.gitignore` 忽略。
- 只有 PHASE 1 生成的 `data/derived/*.json` 才用于公开 GitHub Pages。

## 1. 安装

在仓库根目录：

```bash
python3 -m pip install -r requirements.txt
python3 -m pip install -r collector/requirements.txt
python3 -m playwright install chromium
```

如果不想安装 Playwright 自带 Chromium，也可以使用本机 Chrome：

```bash
python3 collector/collect_xhs.py --headed --browser chrome --dry-run --debug
```

## 2. 第一次登录与探测

首次必须显示浏览器：

```bash
python3 collector/collect_xhs.py --headed --dry-run --debug
```

程序会打开：

`https://creator.xiaohongshu.com/`

如被重定向到登录页，请在浏览器中人工扫码/验证码登录。程序最多等待 300 秒；不会尝试绕过登录验证。

`--dry-run` 只完成：

- 检查登录状态；
- 尝试进入数据中心、账号数据、笔记/内容分析；
- 识别页面上的“导出/下载”入口；
- `--debug` 时保存本地截图与 HTML；
- 不下载数据、不写每日快照、不运行分析。

调试材料默认在：

```text
local-data/collector/inbox/YYYY-MM-DD/HHMMSS/debug/
```

如果导航文字与当前小红书后台不一致，只调整 `collector/selectors.json`，不要把 DOM selector 散落到主程序。

## 3. 正式采集

确认 dry-run 能正常进入数据页后：

```bash
python3 collector/collect_xhs.py --headed --debug
```

当前小红书“内容分析”页的官方导出按钮若导致页面关闭，可使用已验证的可见表格回退模式：

```bash
python3 collector/collect_xhs.py --headed --browser chrome --skip-notes-official-export --debug
```

笔记页会自动切换为每页 50 条后再采集。若页面标题尚未写入 `data/content/content-master.json`，原始行仍保留在私有 CSV 中，其余已匹配笔记继续进入分析，并在 manifest 中记录待补主表提示。

稳定后可关闭浏览器界面：

```bash
python3 collector/collect_xhs.py
```

默认流程：

```text
persistent browser profile
  ↓
创作者后台
  ↓
优先下载官方 CSV / Excel
  ↓
没有导出时提取可见表格/账号指标卡
  ↓
local-data/collector/inbox/YYYY-MM-DD/HHMMSS/
  ↓
scripts/import_xhs_export.py
  ↓
local-data/raw 每日私有快照
  ↓
scripts/analyze.py 逻辑
  ↓
data/derived/*.json
```

## 4. 常用参数

```bash
# 只探测，不下载、不导入
python3 collector/collect_xhs.py --headed --dry-run --debug

# 只采集，不进入 PHASE 1
python3 collector/collect_xhs.py --headed --no-import

# 只采集笔记数据
python3 collector/collect_xhs.py --headed --skip-account

# 官方导出异常时，使用页面表格回退采集
python3 collector/collect_xhs.py --headed --browser chrome --skip-notes-official-export

# 只采集账号数据
python3 collector/collect_xhs.py --headed --skip-notes

# 指定采集日期
python3 collector/collect_xhs.py --date 2026-09-08

# 使用本机 Chrome
python3 collector/collect_xhs.py --headed --browser chrome

# 指定 profile
python3 collector/collect_xhs.py --headed --profile ~/.guagua/xhs-browser-profile
```

## 5. 采集结果

每次运行都会生成私有 `manifest.json`，记录：

- 采集时间；
- 当前数据页 URL；
- 实际点击的导航；
- 发现的导出按钮；
- 官方导出文件；
- 回退采集文件；
- PHASE 1 导入 stdout / stderr；
- warnings / error。

这些信息只用于本地排错，不提交 GitHub。

## 6. 回退模式说明

如果创作者后台没有可点击的官方导出入口：

1. 程序读取可见 HTML table / role=table；
2. 表头至少命中两个 PHASE 1 已知字段时，生成本地 CSV；
3. 账号页另外尝试从“粉丝数、曝光、阅读、主页访问、互动”等可见指标卡读取数字；
4. 无法确定统计周期时，账号回退数据标记为 `metric_window=unknown`，因此不会错误参与近 7 日 KPI 汇总。

如果当前页面大量使用虚拟列表、Canvas 或 shadow DOM，通用回退可能无法取得完整笔记表。此时优先调整导航到官方导出入口，不建议通过非公开接口绕过前端。

## 7. 安全

禁止提交以下内容：

- `~/.guagua/xhs-browser-profile`
- cookies / session / token
- `local-data/`
- 实际官方导出的 CSV / Excel
- debug HTML / screenshot

首次提交前可检查：

```bash
git status --ignored
```

确认上述目录均处于 ignored 状态。
