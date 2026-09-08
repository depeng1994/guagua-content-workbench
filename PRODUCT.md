# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

主要用户是“瓜瓜看经营”的内容运营者。用户会每天快速查看数据，也会每周集中复盘内容表现。

## Product Purpose

工作台统一管理内容排期和小红书经营数据。本次分析看板用于复盘账号、系列和单篇内容表现，帮助用户提取可复用的经营结论；“下一篇做什么”属于后续独立模块，不由本看板承担。

## Positioning

不是通用数据报表，而是把账号指标、同发布周期的单篇比较、系列表现和笔记明细放到同一套内容主表下，让用户能够从账号变化下钻到具体系列与笔记。

## Operating Context

- 日常查看：快速判断账号和近期内容是否出现明显变化。
- 每周复盘：比较哪些系列有效、哪些单篇有效，并查看支撑结论的明细。
- 数据来自本机小红书创作者后台采集，经私有快照和标准化分析后，以公开 derived JSON 提供给静态工作台。

## Capabilities and Constraints

- 保留账号四项核心指标、笔记排名与散点图、笔记明细。
- 系列与单篇内容是本模块的主要分析对象。
- 允许在每日与每周复盘场景中使用同一页面。
- 缺失数据保持为空，不以 0 伪造。
- 生命周期比较必须按相同发布时长进行，避免旧内容因累计时间更长而天然领先。
- 原始导出、Cookie、登录态和私有快照不得进入公开仓库；前端只读取 `data/derived/*.json`。
- 页面继续作为现有静态 GitHub Pages 工作台的一部分，不新增应用框架。

## Brand Commitments

- 产品名称为“瓜瓜看经营 · 内容工作台”。
- 延续现有工作台的系列配色、浅色界面和克制的运营工具语气。
- 项目内矩形容器圆角统一为 `10px`。

## Evidence on Hand

- `data/content/content-master.json`：内容与系列主数据。
- `data/derived/account-summary.json`：账号指标与趋势。
- `data/derived/content-metrics.json`：单篇生命周期、排行和增量。
- `data/derived/series-metrics.json`：系列聚合表现。
- `data/derived/topic-metrics.json`：内容类型、标题类型和行业聚合。
- `data/derived/daily-insights.json`：规则生成的分析提示。
- 原版实现保留了账号四项指标、笔记排名、观看量与涨粉效率散点图、笔记明细等可复用交互证据。

## Product Principles

- 先给出可判断的结论，再展示支撑结论的指标和明细。
- 账号、系列、单篇三个层级可以连续下钻，不让用户在孤立表格之间自行拼接。
- 日常查看保持快速，周度复盘提供足够的比较维度和证据。
- 明确样本量、统计窗口和数据缺口，避免伪精确。
- 分析复盘与选题规划职责分离。
