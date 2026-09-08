(function () {
  "use strict";

  const DATA_ROOT = "./data/derived/";
  const state = { window: "7d", metric: "views", dimension: "content_type", data: null };
  const labels = {
    impressions: "曝光",
    views: "阅读",
    favorites: "收藏",
    interactions: "互动",
    followers_gained: "涨粉"
  };

  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);

  const compact = (value, digits = 1) => {
    if (value == null || Number.isNaN(Number(value))) return "—";
    const number = Number(value);
    if (Math.abs(number) >= 10000) return `${(number / 10000).toFixed(digits).replace(/\.0$/, "")}万`;
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(number);
  };

  const percent = (value) => value == null ? "—" : `${(Number(value) * 100).toFixed(1)}%`;
  const cell = (value, formatter = compact) => `<td class="${value == null ? "phase1-null" : ""}">${formatter(value)}</td>`;
  const windowLabel = (value) => value === "cumulative" ? "累计" : (value || "暂无可比窗口");

  function findAnalysisPanel() {
    return Array.from(document.querySelectorAll('[role="tabpanel"]')).find((node) => node.id && node.id.includes("content-analysis"));
  }

  async function loadData() {
    const names = ["account-summary", "content-metrics", "series-metrics", "topic-metrics", "daily-insights"];
    const results = await Promise.all(names.map(async (name) => {
      const response = await fetch(`${DATA_ROOT}${name}.json`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${name}.json 读取失败（${response.status}）`);
      return response.json();
    }));
    return Object.fromEntries(names.map((name, index) => [name, results[index]]));
  }

  function trendChart(rows) {
    if (!rows.length || !rows.some((row) => row.views != null)) {
      return '<div class="phase1-empty"><strong>暂无账号趋势</strong><p>导入账号每日快照后，这里会显示阅读趋势。</p></div>';
    }
    const usable = rows.filter((row) => row.views != null).slice(-30).map((row) => ({ ...row, value: Number(row.views) }));
    const width = 720, height = 178, pad = 8;
    const max = Math.max(...usable.map((row) => row.value), 1);
    const x = (index) => usable.length === 1 ? width / 2 : pad + index * (width - pad * 2) / (usable.length - 1);
    const y = (value) => height - pad - value / max * (height - pad * 2);
    const points = usable.map((row, index) => `${x(index)},${y(row.value)}`).join(" ");
    const area = `${pad},${height - pad} ${points} ${x(usable.length - 1)},${height - pad}`;
    return `<div class="phase1-chart" aria-label="账号阅读趋势">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="最近 ${usable.length} 个快照的阅读趋势">
        <line class="phase1-chart-grid" x1="0" y1="${height * .25}" x2="${width}" y2="${height * .25}"></line>
        <line class="phase1-chart-grid" x1="0" y1="${height * .5}" x2="${width}" y2="${height * .5}"></line>
        <line class="phase1-chart-grid" x1="0" y1="${height * .75}" x2="${width}" y2="${height * .75}"></line>
        <polygon class="phase1-chart-area" points="${area}"></polygon>
        <polyline class="phase1-chart-line" points="${points}"></polyline>
      </svg>
      <div class="phase1-chart-labels"><span>${escapeHtml(usable[0].date)}</span><span>最高 ${compact(max)}</span><span>${escapeHtml(usable[usable.length - 1].date)}</span></div>
    </div>`;
  }

  function renderRankings() {
    const root = document.querySelector(".phase1-dashboard");
    if (!root || !state.data) return;
    const rows = state.data["content-metrics"].rankings?.[state.window]?.[state.metric] || [];
    root.querySelectorAll("[data-window]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.window === state.window)));
    root.querySelectorAll("[data-metric]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.metric === state.metric)));
    const target = root.querySelector(".phase1-ranking");
    target.innerHTML = rows.length ? rows.slice(0, 8).map((item, index) => `<div class="phase1-rank-row">
      <span class="phase1-rank-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="phase1-rank-topic" title="${escapeHtml(item.topic)}">${escapeHtml(item.topic)}</span>
      <strong class="phase1-rank-value">${compact(item.value)}</strong>
    </div>`).join("") : '<div class="phase1-empty"><strong>该窗口暂无可比数据</strong><p>生命周期窗口只使用达到相同发布时长的快照。</p></div>';
  }

  function seriesTable(rows) {
    const active = rows.filter((row) => row.sample_size > 0);
    if (!active.length) return '<div class="phase1-empty"><strong>暂无系列表现</strong><p>导入笔记快照后自动生成系列对比。</p></div>';
    return `<div class="phase1-table-note">当前比较窗口：${escapeHtml(windowLabel(active[0].comparison_window))}</div><div class="phase1-table-wrap"><table class="phase1-table"><thead><tr>
      <th>系列</th><th>样本</th><th>平均曝光</th><th>平均阅读</th><th>收藏率</th><th>互动率</th><th>涨粉效率</th><th>长尾能力</th><th>爆款率</th>
    </tr></thead><tbody>${active.map((row) => `<tr>
      <td>${escapeHtml(row.series)}</td>${cell(row.sample_size)}${cell(row.average_impressions)}${cell(row.average_views)}${cell(row.average_favorite_rate, percent)}${cell(row.average_engagement_rate, percent)}${cell(row.follow_efficiency, percent)}${cell(row.long_tail_ability, percent)}${cell(row.viral_rate, percent)}
    </tr>`).join("")}</tbody></table></div>`;
  }

  function topicTable(dimensions) {
    const rows = dimensions?.[state.dimension] || [];
    const active = rows.filter((row) => row.sample_size > 0);
    if (!active.length) return '<div class="phase1-empty"><strong>暂无内容结构分析</strong><p>导入笔记快照后自动比较内容类型、标题类型和行业。</p></div>';
    return `<div class="phase1-table-note">当前比较窗口：${escapeHtml(windowLabel(active[0].comparison_window))}</div><div class="phase1-table-wrap"><table class="phase1-table"><thead><tr>
      <th>分类</th><th>样本</th><th>平均曝光</th><th>平均阅读</th><th>收藏率</th><th>互动率</th><th>涨粉效率</th>
    </tr></thead><tbody>${active.map((row) => `<tr>
      <td>${escapeHtml(row.value)}</td>${cell(row.sample_size)}${cell(row.average_impressions)}${cell(row.average_views)}${cell(row.average_favorite_rate, percent)}${cell(row.average_engagement_rate, percent)}${cell(row.follow_efficiency, percent)}
    </tr>`).join("")}</tbody></table></div>`;
  }

  function lifecycleTable(contents) {
    const active = contents.filter((item) => item.latest).slice().sort((a, b) => String(b.publish_date || "").localeCompare(String(a.publish_date || "")));
    if (!active.length) return '<div class="phase1-empty"><strong>暂无生命周期数据</strong><p>同一内容积累多个采集日后可计算 24h / 72h / 7d / 30d。</p></div>';
    return `<div class="phase1-table-wrap"><table class="phase1-table"><thead><tr>
      <th>主题</th><th>24h 阅读</th><th>72h 阅读</th><th>7d 阅读</th><th>30d 阅读</th><th>累计阅读</th><th>长尾能力</th>
    </tr></thead><tbody>${active.map((item) => `<tr>
      <td>${escapeHtml(item.topic)}</td>${cell(item.lifecycle?.["24h"]?.views)}${cell(item.lifecycle?.["72h"]?.views)}${cell(item.lifecycle?.["7d"]?.views)}${cell(item.lifecycle?.["30d"]?.views)}${cell(item.latest?.views)}${cell(item.long_tail?.ratio, percent)}
    </tr>`).join("")}</tbody></table></div>`;
  }

  function renderDashboard(root, data) {
    state.data = data;
    const account = data["account-summary"];
    const recent = account.last_7_days || {};
    const insights = data["daily-insights"].insights || [];
    const hasData = account.latest_date || data["content-metrics"].contents.some((item) => item.latest);
    root.innerHTML = `<div class="phase1-dashboard-header"><div><h2>数据与复盘</h2><p>同发布时长对比 · 缺失值不补零 · 北京时间</p></div><span class="phase1-updated">${account.latest_date ? `更新至 ${escapeHtml(account.latest_date)}` : "等待首次导入"}</span></div>
      <div class="phase1-kpi-strip">
        <div class="phase1-kpi"><span>近 7 日曝光</span><strong>${compact(recent.impressions)}</strong></div>
        <div class="phase1-kpi"><span>近 7 日阅读</span><strong>${compact(recent.views)}</strong></div>
        <div class="phase1-kpi"><span>近 7 日新增粉丝</span><strong>${compact(recent.new_followers)}</strong></div>
        <div class="phase1-kpi"><span>近 7 日发布频率</span><strong>${compact(recent.publish_count, 0)} 篇</strong></div>
      </div>
      ${hasData ? "" : '<div class="phase1-panel phase1-wide phase1-empty"><strong>PHASE 1 已就绪，等待导入官方数据</strong><p>把 CSV / Excel 放入 imports 后运行一条命令，即可生成快照、分析结果并更新此页。</p><span class="phase1-command">python3 scripts/import_xhs_export.py ./imports</span></div>'}
      <div class="phase1-grid">
        <section class="phase1-panel"><div class="phase1-section-head"><div><h3>账号趋势</h3><p>最近 30 个账号快照 · 阅读</p></div></div>${trendChart(account.trend || [])}</section>
        <section class="phase1-panel"><div class="phase1-section-head"><div><h3>每日洞察</h3><p>规则生成，最多 5 条</p></div></div><div class="phase1-insights">${insights.map((item) => `<article class="phase1-insight" data-type="${escapeHtml(item.type)}"><span class="phase1-insight-dot"></span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div></article>`).join("")}</div></section>
      </div>
      <section class="phase1-panel phase1-wide"><div class="phase1-section-head"><div><h3>内容排行</h3><p>按相同发布时长比较，避免累计数据偏向旧内容</p></div><div class="phase1-ranking-controls">
        <div class="phase1-segment" role="group" aria-label="排行窗口">${["24h","72h","7d","30d","cumulative"].map((value) => `<button data-window="${value}" aria-pressed="${value === state.window}">${value === "cumulative" ? "累计" : value}</button>`).join("")}</div>
        <div class="phase1-segment" role="group" aria-label="排行指标">${Object.entries(labels).map(([value, label]) => `<button data-metric="${value}" aria-pressed="${value === state.metric}">${label}</button>`).join("")}</div>
      </div></div><div class="phase1-ranking"></div></section>
      <section class="phase1-panel phase1-wide"><div class="phase1-section-head"><div><h3>系列表现</h3><p>同时展示样本数；爆款率采用账号历史同窗口 Top 20%</p></div></div>${seriesTable(data["series-metrics"].series || [])}</section>
      <section class="phase1-panel phase1-wide phase1-topic-panel"><div class="phase1-section-head"><div><h3>内容结构</h3><p>按标签拆解表现，所有结论同时展示样本数</p></div><div class="phase1-segment" role="group" aria-label="内容结构维度">
        <button data-dimension="content_type" aria-pressed="true">内容类型</button><button data-dimension="title_type" aria-pressed="false">标题类型</button><button data-dimension="industry" aria-pressed="false">行业</button>
      </div></div><div class="phase1-topic-table">${topicTable(data["topic-metrics"].dimensions || {})}</div></section>
      <section class="phase1-panel phase1-wide"><div class="phase1-section-head"><div><h3>内容生命周期</h3><p>长尾能力 = 发布 72 小时后的新增阅读 / 7 日累计阅读</p></div></div>${lifecycleTable(data["content-metrics"].contents || [])}</section>`;
    root.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-window],button[data-metric],button[data-dimension]");
      if (!button) return;
      if (button.dataset.window) state.window = button.dataset.window;
      if (button.dataset.metric) state.metric = button.dataset.metric;
      if (button.dataset.dimension) {
        state.dimension = button.dataset.dimension;
        root.querySelectorAll("[data-dimension]").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.dimension === state.dimension)));
        root.querySelector(".phase1-topic-table").innerHTML = topicTable(data["topic-metrics"].dimensions || {});
      }
      renderRankings();
    });
    renderRankings();
  }

  function mount() {
    const panel = findAnalysisPanel();
    if (!panel || panel.querySelector(".phase1-dashboard")) return;
    panel.classList.add("phase1-mounted");
    const root = document.createElement("div");
    root.className = "phase1-dashboard";
    root.innerHTML = '<div class="phase1-panel phase1-empty"><strong>正在读取分析结果</strong><p>从 data/derived 加载已处理 JSON。</p></div>';
    panel.appendChild(root);
    loadData().then((data) => renderDashboard(root, data)).catch((error) => {
      root.innerHTML = `<div class="phase1-panel phase1-empty"><strong>分析结果读取失败</strong><p>${escapeHtml(error.message)}。请确认使用 HTTP 服务打开页面，并已运行分析脚本。</p></div>`;
    });
  }

  function boot() {
    const trigger = Array.from(document.querySelectorAll('button[role="tab"]')).find((button) => button.textContent.includes("数据与复盘"));
    if (trigger) trigger.addEventListener("click", () => window.setTimeout(mount, 0));
    mount();
    new MutationObserver(() => mount()).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
