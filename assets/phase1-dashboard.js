(function () {
  "use strict";

  const DATA_SOURCES = {
    account: "./data/derived/account-summary.json",
    content: "./data/derived/content-metrics.json",
    series: "./data/derived/series-metrics.json",
    insights: "./data/derived/daily-insights.json",
    master: "./data/content/content-master.json"
  };

  const state = {
    period: "7d",
    window: "cumulative",
    metric: "views",
    seriesWindow: "7d",
    seriesMetric: "average_views",
    linkedSeries: "all",
    seriesFilter: "all",
    search: "",
    data: null
  };

  const SERIES_MIN_SAMPLE = 3;

  const metricLabels = {
    views: "阅读",
    favorites: "收藏",
    interactions: "互动",
    followers_gained: "涨粉"
  };

  const seriesMetricLabels = {
    average_views: "平均阅读",
    average_favorite_rate: "收藏率",
    follow_efficiency: "涨粉效率"
  };

  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);

  const number = (value, digits = 1) => {
    if (value == null || Number.isNaN(Number(value))) return "—";
    const current = Number(value);
    if (Math.abs(current) >= 10000) return `${(current / 10000).toFixed(digits).replace(/\.0$/, "")}万`;
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(current);
  };

  const percent = (value, digits = 1) => value == null || Number.isNaN(Number(value))
    ? "—"
    : `${(Number(value) * 100).toFixed(digits)}%`;

  const median = (values) => {
    const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };

  const safeRate = (numerator, denominator) => denominator ? Number(numerator || 0) / Number(denominator) : null;

  const average = (values) => {
    const valid = values.filter((value) => value != null && Number.isFinite(Number(value))).map(Number);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  };

  function findAnalysisPanel() {
    return Array.from(document.querySelectorAll('[role="tabpanel"]')).find((node) => node.id && node.id.includes("content-analysis"));
  }

  function syncTopbar(title) {
    const heading = document.querySelector(".topbar-lead h1");
    if (heading) heading.textContent = title;
  }

  async function loadData() {
    const entries = await Promise.all(Object.entries(DATA_SOURCES).map(async ([name, path]) => {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`${path} 读取失败（${response.status}）`);
      return [name, await response.json()];
    }));
    return Object.fromEntries(entries);
  }

  function seriesColor(name) {
    const series = state.data?.master?.series || [];
    return series.find((item) => item.name === name)?.color || "#647187";
  }

  function publishedTitle(contentId, fallback = "") {
    const item = (state.data?.content?.contents || []).find((entry) => entry.content_id === contentId);
    return item?.title || fallback;
  }

  function periodAccount() {
    const account = state.data.account;
    if (state.period === "1d") {
      const latest = account.trend?.[account.trend.length - 1] || account.latest || {};
      return {
        label: "最近一日",
        date: latest.date || account.latest_date,
        impressions: latest.impressions,
        views: latest.views,
        newFollowers: latest.new_followers ?? latest.followers_delta,
        publishCount: state.data.content.contents.filter((item) => item.publish_date === latest.date).length,
        coverage: latest.date ? "单日快照" : "等待快照"
      };
    }
    const weekly = account.last_7_days || {};
    return {
      label: "近 7 日",
      date: weekly.period_end || account.latest_date,
      impressions: weekly.impressions,
      views: weekly.views,
      newFollowers: weekly.new_followers,
      publishCount: weekly.publish_count,
      coverage: weekly.coverage_days ? `${weekly.coverage_days}/7 天数据` : "数据覆盖不足"
    };
  }

  function comparisonText(value, previous) {
    if (value == null || previous == null || Number(previous) === 0) return "暂无上期可比数据";
    const change = (Number(value) - Number(previous)) / Number(previous);
    return `${change >= 0 ? "较前一日 +" : "较前一日 "}${(change * 100).toFixed(1)}%`;
  }

  function kpiCards() {
    const current = periodAccount();
    const trend = state.data.account.trend || [];
    const previous = trend.length > 1 ? trend[trend.length - 2] : {};
    const viewRate = safeRate(current.views, current.impressions);
    const isDaily = state.period === "1d";
    const cards = [
      {
        label: `${current.label}曝光`, value: number(current.impressions),
        foot: isDaily ? comparisonText(current.impressions, previous.impressions) : current.coverage
      },
      {
        label: `${current.label}阅读`, value: number(current.views),
        foot: isDaily
          ? `${comparisonText(current.views, previous.views)} · 阅读率 ${percent(viewRate)}`
          : `日均 ${number(current.views == null ? null : current.views / 7)} · 阅读率 ${percent(viewRate)}`
      },
      {
        label: `${current.label}涨粉`, value: number(current.newFollowers),
        foot: current.newFollowers == null ? "官方当前未提供，保持空值" : "账号新增关注"
      },
      {
        label: `${current.label}发布`, value: current.publishCount == null ? "—" : `${number(current.publishCount, 0)} 篇`,
        foot: current.date ? `统计至 ${current.date}` : "等待数据"
      }
    ];
    return cards.map((item, index) => `<article class="review-kpi">
      <span class="review-kpi-index">0${index + 1}</span>
      <span class="review-kpi-label">${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <p>${escapeHtml(item.foot)}</p>
    </article>`).join("");
  }

  function seriesSignalRows() {
    return (state.data.master.series || []).map((series) => {
      const samples = state.data.content.contents
        .filter((item) => item.series === series.name)
        .map((item) => item.lifecycle?.[state.seriesWindow])
        .filter(Boolean);
      return {
        series: series.name,
        sample_size: samples.length,
        average_views: average(samples.map((item) => item.views)),
        average_favorite_rate: average(samples.map((item) => item.favorite_rate)),
        follow_efficiency: average(samples.map((item) => item.follow_conversion_rate)),
        comparison_window: state.seriesWindow
      };
    });
  }

  function seriesStage(sampleSize) {
    if (sampleSize >= SERIES_MIN_SAMPLE) return "系列结论";
    if (sampleSize === 2) return "初步趋势";
    if (sampleSize === 1) return "单篇信号";
    return "等待样本";
  }

  function seriesWindowText(value) {
    return value === "7d" ? "7 天快速信号" : "30 天成熟表现";
  }

  function linkedRankingRows() {
    const rows = state.data.content.rankings?.[state.window]?.[state.metric] || [];
    if (state.linkedSeries === "all") return rows;
    return rows.filter((item) => {
      const content = state.data.content.contents.find((entry) => entry.content_id === item.content_id);
      return content?.series === state.linkedSeries;
    });
  }

  function bestBy(rows, key) {
    return rows.filter((item) => item[key] != null).slice().sort((a, b) => Number(b[key]) - Number(a[key]))[0] || null;
  }

  function reviewFindings() {
    const rows = seriesSignalRows().filter((item) => item.sample_size > 0);
    const eligibleRows = rows.filter((item) => Number(item.sample_size || 0) >= SERIES_MIN_SAMPLE);
    const scaleLeader = bestBy(eligibleRows, "average_views");
    const saveLeader = bestBy(eligibleRows, "average_favorite_rate");
    const noteLeader = state.data.content.rankings?.[state.window]?.views?.[0] ||
      state.data.content.rankings?.cumulative?.views?.[0];
    const dataInsight = state.data.insights?.insights?.[0];
    const findings = [];
    if (!eligibleRows.length && rows.length) {
      const strongestSignal = rows.slice().sort((a, b) => Number(b.sample_size) - Number(a.sample_size))[0];
      findings.push({
        label: "系列证据",
        title: strongestSignal.sample_size === 2
          ? `${strongestSignal.series} 已出现初步趋势`
          : "当前只有单篇信号，暂不下系列结论",
        evidence: `${strongestSignal.sample_size} 篇${seriesWindowText(state.seriesWindow)}样本；满 ${SERIES_MIN_SAMPLE} 篇后升级为系列结论`,
        tone: "primary"
      });
    }
    if (scaleLeader) findings.push({
      label: "系列规模",
      title: `${scaleLeader.series} 当前平均阅读领先`,
      evidence: `${number(scaleLeader.average_views)} 次 / 篇 · ${scaleLeader.sample_size} 篇同窗口样本`,
      tone: "primary"
    });
    if (saveLeader) findings.push({
      label: "收藏质量",
      title: `${saveLeader.series} 当前收藏率最高`,
      evidence: `${percent(saveLeader.average_favorite_rate)} · ${saveLeader.sample_size} 篇同窗口样本`,
      tone: "quality"
    });
    if (noteLeader) findings.push({
      label: "单篇峰值",
      title: `${publishedTitle(noteLeader.content_id, noteLeader.topic)} ${state.window === "cumulative" ? "累计阅读最高" : `在 ${state.window} 阅读领先`}`,
      evidence: state.window === "cumulative"
        ? `${number(noteLeader.value)} 次阅读 · 累计口径，未控制发布时间`
        : `${number(noteLeader.value)} 次阅读 · 按相同发布时长比较`,
      tone: "note"
    });
    if (dataInsight) findings.push({
      label: "数据质量",
      title: dataInsight.title,
      evidence: dataInsight.detail,
      tone: "attention"
    });
    return findings.slice(0, 3).map((item) => `<article class="review-finding" data-tone="${item.tone}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.evidence)}</p>
    </article>`).join("");
  }

  function seriesBoard() {
    const key = state.seriesMetric;
    const masterOrder = new Map((state.data.master.series || []).map((item, index) => [item.name, index]));
    const rows = seriesSignalRows().slice().sort((a, b) => {
      const aHasValue = a[key] != null;
      const bHasValue = b[key] != null;
      if (aHasValue !== bHasValue) return aHasValue ? -1 : 1;
      if (aHasValue && Number(a[key]) !== Number(b[key])) return Number(b[key]) - Number(a[key]);
      return Number(masterOrder.get(a.series) ?? 999) - Number(masterOrder.get(b.series) ?? 999);
    });
    const max = Math.max(...rows.map((item) => Number(item[key] || 0)), 1);
    const format = key === "average_views" ? number : percent;
    if (!rows.length) return '<div class="review-empty">暂无可比较的系列数据。</div>';
    return rows.map((item) => {
      const hasValue = item[key] != null;
      const sampleText = Number(item.sample_size || 0) > 0
        ? `${seriesStage(item.sample_size)} · ${item.sample_size} 篇 ${item.comparison_window === "7d" ? "7 天" : "30 天"}`
        : `等待${seriesWindowText(item.comparison_window)}样本`;
      const selected = state.linkedSeries === item.series;
      return `<button class="series-score-row${hasValue ? "" : " is-empty"}" data-linked-series="${escapeHtml(item.series)}" aria-pressed="${String(selected)}" style="--series-color:${seriesColor(item.series)}">
      <div class="series-score-main">
        <span class="series-marker"></span>
        <div><strong>${escapeHtml(item.series)}</strong><small>${escapeHtml(sampleText)}</small></div>
      </div>
      <div class="series-score-track" aria-hidden="true"><span style="width:${hasValue ? Math.max(4, Number(item[key] || 0) / max * 100) : 0}%;--series-color:${seriesColor(item.series)}"></span></div>
      <strong class="series-score-value">${format(item[key])}</strong>
      <span class="series-score-rank">n=${number(item.sample_size, 0)}</span>
    </button>`;
    }).join("");
  }

  function rankingBoard() {
    const rows = linkedRankingRows();
    if (!rows.length) return `<div class="review-empty">${state.linkedSeries === "all" ? "当前窗口暂无可比笔记。" : `${escapeHtml(state.linkedSeries)}在当前窗口暂无可比笔记。`}</div>`;
    const max = Math.max(...rows.map((item) => Number(item.value || 0)), 1);
    return rows.map((item, index) => {
      const title = publishedTitle(item.content_id, item.topic);
      return `<button class="note-rank-row" data-content-id="${escapeHtml(item.content_id)}" title="${escapeHtml(title)}">
      <span class="note-rank-number">${String(index + 1).padStart(2, "0")}</span>
      <span class="note-rank-copy"><strong>${escapeHtml(title)}</strong><i><b style="width:${Number(item.value || 0) / max * 100}%"></b></i></span>
      <span class="note-rank-value">${number(item.value)}</span>
    </button>`;
    }).join("");
  }

  function scatterPlot() {
    const items = state.data.content.contents
      .filter((item) => item.latest?.views != null && item.latest?.followers_gained != null)
      .map((item) => ({
        id: item.content_id,
        title: item.title || item.topic,
        series: item.series,
        x: Number(item.latest.views),
        y: item.latest.views ? Number(item.latest.followers_gained) / Number(item.latest.views) * 1000 : 0
      }));
    if (!items.length) return '<div class="review-empty">暂无同时包含阅读与涨粉的数据。</div>';
    const width = 1000, height = 300, left = 58, right = 24, top = 22, bottom = 38;
    const xMax = Math.max(...items.map((item) => item.x), 1);
    const yMax = Math.max(...items.map((item) => item.y), 1);
    const xPos = (value) => left + Math.sqrt(value / xMax) * (width - left - right);
    const yPos = (value) => height - bottom - Math.sqrt(value / yMax) * (height - top - bottom);
    const xMedian = median(items.map((item) => item.x));
    const yMedian = median(items.map((item) => item.y));
    const circles = items.map((item) => `<circle class="scatter-point" data-content-id="${escapeHtml(item.id)}" cx="${xPos(item.x)}" cy="${yPos(item.y)}" r="5" fill="${seriesColor(item.series)}" role="button" tabindex="0" aria-label="${escapeHtml(item.title)}，阅读 ${number(item.x)}，每千阅读涨粉 ${number(item.y, 1)}"><title>${escapeHtml(item.title)}｜阅读 ${number(item.x)}｜每千阅读涨粉 ${number(item.y, 1)}</title></circle>`).join("");
    return `<div class="scatter-shell">
      <svg class="review-scatter" viewBox="0 0 ${width} ${height}" role="group" aria-label="阅读量与每千阅读涨粉散点图，可点选每篇笔记">
        <line class="scatter-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"></line>
        <line class="scatter-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"></line>
        <line class="scatter-median" x1="${xPos(xMedian)}" y1="${top}" x2="${xPos(xMedian)}" y2="${height - bottom}"></line>
        <line class="scatter-median" x1="${left}" y1="${yPos(yMedian)}" x2="${width - right}" y2="${yPos(yMedian)}"></line>
        <text class="scatter-quadrant" x="${width - right - 8}" y="${top + 13}" text-anchor="end">高阅读 · 高转粉</text>
        <text class="scatter-quadrant" x="${left + 8}" y="${height - bottom - 9}">低阅读 · 低转粉</text>
        ${circles}
        <text class="scatter-axis-label" x="${(left + width - right) / 2}" y="${height - 7}" text-anchor="middle">累计阅读（平方根刻度）</text>
        <text class="scatter-axis-label" x="16" y="${height / 2}" transform="rotate(-90 16 ${height / 2})" text-anchor="middle">每千阅读涨粉（平方根刻度）</text>
      </svg>
    </div>`;
  }

  function detailRows() {
    const query = state.search.trim().toLowerCase();
    return state.data.content.contents
      .filter((item) => item.latest)
      .filter((item) => state.seriesFilter === "all" || item.series === state.seriesFilter)
      .filter((item) => !query || `${item.title} ${item.topic} ${item.series}`.toLowerCase().includes(query))
      .sort((a, b) => String(b.publish_date || "").localeCompare(String(a.publish_date || "")));
  }

  function detailTable() {
    const rows = detailRows();
    if (!rows.length) return '<div class="review-empty">没有符合当前筛选条件的笔记。</div>';
    return `<div class="review-table-wrap"><table class="review-table">
      <thead><tr><th>发布文案</th><th>系列</th><th>发布日期</th><th>曝光</th><th>阅读</th><th>阅读率</th><th>收藏</th><th>互动</th><th>涨粉</th><th>采集日</th></tr></thead>
      <tbody>${rows.map((item) => `<tr data-row-id="${escapeHtml(item.content_id)}">
        <td><strong title="${escapeHtml(item.title || item.topic)}">${escapeHtml(item.title || item.topic)}</strong></td>
        <td><span class="series-tag table-series" style="--series-color:${seriesColor(item.series)};--series-fill:color-mix(in srgb, ${seriesColor(item.series)} 9%, #fff)">${escapeHtml(item.series)}</span></td>
        <td>${escapeHtml(item.publish_date || "—")}</td>
        <td>${number(item.latest.impressions)}</td>
        <td class="table-strong">${number(item.latest.views)}</td>
        <td>${percent(item.latest.view_rate)}</td>
        <td>${number(item.latest.favorites)}</td>
        <td>${number(item.latest.interactions)}</td>
        <td>${number(item.latest.followers_gained)}</td>
        <td>${escapeHtml(item.latest.snapshot_date || "—")}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
  }

  function segmentButton(group, value, label, current) {
    return `<button data-${group}="${value}" aria-pressed="${String(value === current)}">${escapeHtml(label)}</button>`;
  }

  function renderDashboard() {
    const root = document.querySelector(".phase1-dashboard");
    if (!root || !state.data) return;
    const accountDate = state.data.account.latest_date;
    const signalRows = seriesSignalRows();
    const activeSeriesRows = signalRows.filter((item) => item.sample_size > 0);
    const rankingRows = linkedRankingRows();
    const linkageLabel = state.linkedSeries === "all" ? "全部系列" : state.linkedSeries;
    const seriesWindowLabel = seriesWindowText(state.seriesWindow);
    root.innerHTML = `<div class="review-dashboard-head">
      <div><h2>经营复盘</h2><p>账号可切日 / 周；系列与单篇按各自窗口比较，不混入选题决策。</p></div>
      <div class="review-head-actions"><span class="review-updated">数据更新至 ${escapeHtml(accountDate || "等待采集")}</span><div class="review-period-control"><span>账号观察周期</span><div class="review-segment" role="group" aria-label="账号观察周期">
        ${segmentButton("period", "1d", "最近一日", state.period)}${segmentButton("period", "7d", "近 7 日", state.period)}
      </div></div></div>
    </div>

    <section class="review-account" aria-labelledby="review-account-title">
      <div class="review-section-title"><div><h3 id="review-account-title">账号基本盘</h3></div><p>${escapeHtml(periodAccount().coverage)}</p></div>
      <div class="review-kpi-grid">${kpiCards()}</div>
    </section>

    <section class="review-findings" aria-labelledby="review-findings-title">
      <div class="review-section-title"><div><h3 id="review-findings-title">当前证据</h3></div><p>结论标明统计窗口、样本量与数据限制</p></div>
      <div class="review-finding-grid">${reviewFindings()}</div>
    </section>

    <div class="review-comparison-grid">
      <section class="review-panel review-series" aria-labelledby="review-series-title">
        <div class="review-panel-head"><div><h3 id="review-series-title">系列有效性</h3><p>当前为${seriesWindowLabel}；1 篇是单篇信号，2 篇是初步趋势，${SERIES_MIN_SAMPLE} 篇起形成系列结论。</p></div><div class="review-control-stack">
          <div class="review-segment compact" role="group" aria-label="系列观察窗口">${segmentButton("series-window", "7d", "7 天快速", state.seriesWindow)}${segmentButton("series-window", "30d", "30 天成熟", state.seriesWindow)}</div>
          <div class="review-segment compact" role="group" aria-label="系列比较指标">${Object.entries(seriesMetricLabels).map(([value, label]) => segmentButton("series-metric", value, label, state.seriesMetric)).join("")}</div>
        </div></div>
        <div class="series-score-list">${seriesBoard()}</div>
        <p class="review-panel-foot">${signalRows.length} 个系列已纳入 · ${activeSeriesRows.length} 个有${seriesWindowLabel}样本</p>
      </section>

      <section class="review-panel review-note-effect" aria-labelledby="review-note-title">
        <div class="review-panel-head"><div><div class="review-title-line"><h3 id="review-note-title">单篇有效性</h3>${state.linkedSeries === "all" ? '<span class="review-link-state">全部系列</span>' : `<button class="review-clear-link" data-clear-link title="清除系列联动">${escapeHtml(linkageLabel)} ×</button>`}</div><p>${rankingRows.length} 篇 · ${state.linkedSeries === "all" ? "点击左侧系列可联动筛选" : "已按系列联动筛选"}</p></div><div class="review-control-stack">
          <div class="review-segment compact" role="group" aria-label="排行窗口">${["24h", "72h", "7d", "30d", "cumulative"].map((value) => segmentButton("window", value, value === "cumulative" ? "累计" : value, state.window)).join("")}</div>
          <div class="review-segment compact" role="group" aria-label="排行指标">${Object.entries(metricLabels).map(([value, label]) => segmentButton("metric", value, label, state.metric)).join("")}</div>
        </div></div>
        <div class="note-ranking-block"><div class="note-ranking-list">${rankingBoard()}</div></div>
      </section>
    </div>

    <section class="review-panel review-scatter-panel" aria-labelledby="review-scatter-title">
      <div class="review-panel-head"><div><h3 id="review-scatter-title">阅读 × 转粉效率</h3><p data-scatter-summary role="status" aria-live="polite">全部单篇 · 虚线为当前样本中位数，点选圆点查看数据。</p></div><div class="scatter-legend">${(state.data.master.series || []).map((item) => `<span><i style="background:${item.color}"></i>${escapeHtml(item.name)}</span>`).join("")}</div></div>
      <div class="scatter-block">${scatterPlot()}</div>
    </section>

    <section class="review-panel review-details" aria-labelledby="review-detail-title">
      <div class="review-panel-head"><div><h3 id="review-detail-title">笔记明细</h3><p>累计指标 · 最近一次采集快照 · ${detailRows().length} 篇</p></div>
        <div class="review-detail-controls">
          <label class="review-search"><span>搜索</span><input type="search" data-search value="${escapeHtml(state.search)}" placeholder="搜索笔记或系列"></label>
          <label class="review-select"><span>系列</span><select data-series-filter><option value="all">全部系列</option>${(state.data.master.series || []).map((item) => `<option value="${escapeHtml(item.name)}" ${item.name === state.seriesFilter ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
        </div>
      </div>
      <div class="review-detail-body">${detailTable()}</div>
    </section>
    <p class="review-method">口径说明：系列按 7 天快速信号与 30 天成熟表现分层观察；1 篇显示单篇信号，2 篇显示初步趋势，${SERIES_MIN_SAMPLE} 篇起形成系列结论。单篇的 24h / 72h / 7d / 30d 只比较达到相同发布时长的快照；累计排名不控制发布时间。</p>`;
  }

  function showScatterReadout(contentId) {
    const item = state.data.content.contents.find((entry) => entry.content_id === contentId);
    const readout = document.querySelector("[data-scatter-summary]");
    if (!item?.latest || !readout) return;
    const efficiency = item.latest.views
      ? Number(item.latest.followers_gained || 0) / Number(item.latest.views) * 1000
      : null;
    readout.textContent = `${item.title || item.topic} · 阅读 ${number(item.latest.views)} · 每千阅读涨粉 ${number(efficiency, 1)}`;
  }

  function selectContent(contentId) {
    const row = document.querySelector(`[data-row-id="${CSS.escape(contentId)}"]`);
    if (!row) return;
    document.querySelectorAll(".review-table tr.is-selected").forEach((item) => item.classList.remove("is-selected"));
    row.classList.add("is-selected");
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function bindDashboard(root) {
    root.addEventListener("click", (event) => {
      const period = event.target.closest("button[data-period]");
      const windowButton = event.target.closest("button[data-window]");
      const metric = event.target.closest("button[data-metric]");
      const seriesWindow = event.target.closest("button[data-series-window]");
      const seriesMetric = event.target.closest("button[data-series-metric]");
      const linkedSeries = event.target.closest("button[data-linked-series]");
      const clearLink = event.target.closest("button[data-clear-link]");
      const content = event.target.closest("[data-content-id]");
      if (period) {
        state.period = period.dataset.period;
        renderDashboard();
      } else if (windowButton) {
        state.window = windowButton.dataset.window;
        renderDashboard();
      } else if (metric) {
        state.metric = metric.dataset.metric;
        renderDashboard();
      } else if (seriesWindow) {
        state.seriesWindow = seriesWindow.dataset.seriesWindow;
        renderDashboard();
      } else if (seriesMetric) {
        state.seriesMetric = seriesMetric.dataset.seriesMetric;
        renderDashboard();
      } else if (linkedSeries) {
        state.linkedSeries = linkedSeries.dataset.linkedSeries;
        renderDashboard();
      } else if (clearLink) {
        state.linkedSeries = "all";
        renderDashboard();
      } else if (content?.classList.contains("scatter-point")) {
        showScatterReadout(content.dataset.contentId);
      } else if (content) {
        selectContent(content.dataset.contentId);
      }
    });
    root.addEventListener("keydown", (event) => {
      const point = event.target.closest?.(".scatter-point[data-content-id]");
      if (!point || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      showScatterReadout(point.dataset.contentId);
    });
    root.addEventListener("input", (event) => {
      if (!event.target.matches("[data-search]")) return;
      state.search = event.target.value;
      const body = root.querySelector(".review-detail-body");
      if (body) body.innerHTML = detailTable();
      const count = root.querySelector(".review-details .review-panel-head p");
      if (count) count.textContent = `累计指标 · 最近一次采集快照 · ${detailRows().length} 篇`;
    });
    root.addEventListener("change", (event) => {
      if (!event.target.matches("[data-series-filter]")) return;
      state.seriesFilter = event.target.value;
      const body = root.querySelector(".review-detail-body");
      if (body) body.innerHTML = detailTable();
      const count = root.querySelector(".review-details .review-panel-head p");
      if (count) count.textContent = `累计指标 · 最近一次采集快照 · ${detailRows().length} 篇`;
    });
  }

  function mount() {
    const panel = findAnalysisPanel();
    if (!panel || panel.querySelector(".phase1-dashboard")) return;
    panel.classList.add("phase1-mounted");
    const root = document.createElement("div");
    root.className = "phase1-dashboard";
    root.innerHTML = '<div class="review-loading"><strong>正在整理复盘证据</strong><p>读取账号、系列与笔记分析数据。</p></div>';
    panel.appendChild(root);
    bindDashboard(root);
    loadData().then((data) => {
      state.data = data;
      renderDashboard();
    }).catch((error) => {
      root.innerHTML = `<div class="review-loading"><strong>分析结果读取失败</strong><p>${escapeHtml(error.message)}。请确认已运行分析脚本并通过 HTTP 服务打开页面。</p></div>`;
    });
  }

  function boot() {
    const tabs = Array.from(document.querySelectorAll('button[role="tab"]'));
    const analysis = tabs.find((button) => button.textContent.includes("数据与复盘"));
    const content = tabs.find((button) => button.textContent.includes("内容与排期"));
    if (analysis) analysis.addEventListener("click", () => {
      syncTopbar("数据与复盘");
      window.setTimeout(mount, 0);
    });
    if (content) content.addEventListener("click", () => syncTopbar("内容与排期"));
    mount();
    new MutationObserver(() => mount()).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
