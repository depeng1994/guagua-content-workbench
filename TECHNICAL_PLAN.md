# PHASE 1 技术方案

## 审计结论

- 页面入口：`index.html`，GitHub Pages 从仓库根目录发布。
- 页面实现：静态导出的 React/RSC 页面；现有交互位于 `assets/workbench-BJsLk1Rj.js`，样式位于 `assets/index-DnGr5Bit.css`。
- 排期数据：唯一维护源为 `data/content/content-master.json`。现有静态 UI 仍需要 `index.html` 中的 RSC 兼容快照，由 `scripts/sync_content_master.py` 单向生成，不再手工维护；生成过程会同时清理原始后台数据。
- 数据与复盘：当前使用嵌入快照；本阶段通过独立的 `assets/phase1-dashboard.js` 读取 `data/derived/*.json`，避免继续修改大型打包文件。
- 部署方式：无构建步骤的 GitHub Pages 静态站点，保留 `.nojekyll`。

## 增量改造边界

保留：

- `index.html` 的整体页面结构与「内容与排期」界面。
- 现有打包 JS、基础 CSS、系列配色和卡片布局。
- 当前 GitHub Pages 根目录发布方式。

新增：

- `data/content/`：唯一内容主表。
- `data/schema/`：内容、账号快照、笔记快照的数据契约。
- `data/derived/`：可公开、供前端读取的分析结果。
- `scripts/`：导入、校验和分析逻辑。
- `scripts/sync_content_master.py`：从唯一内容主表刷新现有排期兼容快照。
- `tests/`：核心计算与历史快照保护测试。
- `assets/phase1-dashboard.*`：独立的数据与复盘视图。
- `local-data/raw/`：默认的私有快照位置，已被 Git 忽略。

暂不执行：

- Playwright 登录和自动采集（PHASE 2）。
- launchd、自动 commit / push（PHASE 3）。

## 数据流

`CSV / Excel → 字段标准化 → 批次校验 → local-data/raw 每日快照 → analyze → data/derived → GitHub Pages 工作台`

原则：快照只新增、不覆盖；缺失值使用 `null`；负增长不作为增量而记录 warning；公开仓库默认只提交主表与 derived 聚合结果。
