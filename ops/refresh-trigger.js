/* 瓜瓜内容工作台 · 「更新数据」浮动按钮
 *
 * 在页面右下角渲染一个常驻浮动按钮，点击后请求本机的触发服务
 * (ops/trigger_server.py)，由它在本机跑 ops/run_daily.sh 完成
 * 采集 -> 分析 -> 同步 -> 提交推送，完成后自动刷新页面拉最新数据。
 *
 * 用浮动按钮而不是劫持页面里的某个按钮，因为工作台有两个不同布局的页面
 * （排期 / 经营复盘），原按钮只在排期页存在；浮动按钮在哪个页面都能用。
 *
 * 这一段是内联进 index.html 的，不能用 ES module 语法。
 */
(function () {
  "use strict";

  var BASE = "http://127.0.0.1:8899";
  var POLL_MS = 3000;
  var MAX_WAIT_MS = 35 * 60 * 1000; // 采集 + 后台推送重试（最长约 30 分钟）的总上限
  var busy = false;
  var btn = null;
  var panel = null;
  var bodyEl = null;
  var titleEl = null;
  var currentLabel = "更新数据";

  /* ---------- 注入样式 ---------- */
  function injectStyle() {
    if (document.getElementById("gg-trigger-style")) return;
    var s = document.createElement("style");
    s.id = "gg-trigger-style";
    s.textContent =
      "#gg-trigger-btn{position:fixed;right:20px;bottom:20px;z-index:99999;" +
      "display:inline-flex;align-items:center;gap:6px;padding:8px 14px;" +
      "background:#fff;color:#1f2328;border:1px solid #d8dee4;border-radius:8px;" +
      "box-shadow:0 4px 12px rgba(31,35,40,.12);cursor:pointer;" +
      "font:13px/1 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;" +
      "font-weight:500;transition:transform .15s,box-shadow .15s,border-color .15s;" +
      "user-select:none}" +
      "#gg-trigger-btn:hover:not(:disabled){border-color:#b8c2cc;" +
      "box-shadow:0 6px 16px rgba(31,35,40,.16);transform:translateY(-1px)}" +
      "#gg-trigger-btn:active:not(:disabled){transform:translateY(0)}" +
      "#gg-trigger-btn:disabled{opacity:.75;cursor:not-allowed}" +
      "#gg-trigger-btn svg{width:14px;height:14px;color:#57606a}" +
      "#gg-trigger-btn.gg-ok{border-color:#1f883d;color:#1a7f37}" +
      "#gg-trigger-btn.gg-ok svg{color:#1a7f37}" +
      ".gg-spin{animation:gg-spin 1s linear infinite;transform-origin:50% 50%}" +
      "@keyframes gg-spin{to{transform:rotate(360deg)}}" +
      "#gg-trigger-panel{position:fixed;right:20px;bottom:68px;z-index:99999;" +
      "width:380px;max-width:calc(100vw - 40px);background:#fff;color:#1f2328;" +
      "border:1px solid #d8dee4;border-radius:12px;box-shadow:0 12px 32px rgba(31,35,40,.18);" +
      "font:13px/1.6 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;overflow:hidden}" +
      "#gg-trigger-panel .gg-t{display:flex;align-items:center;justify-content:space-between;" +
      "padding:10px 14px;font-weight:600;background:#f6f8fa;border-bottom:1px solid #e6eaef}" +
      "#gg-trigger-panel .gg-x{border:0;background:transparent;cursor:pointer;font-size:16px;" +
      "line-height:1;color:#6e7781;padding:0 2px}" +
      "#gg-trigger-panel .gg-b{padding:12px 14px;max-height:38vh;overflow:auto}" +
      "#gg-trigger-panel .gg-log{margin-top:8px;padding:8px;background:#f6f8fa;border-radius:6px;" +
      "font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#57606a;" +
      "white-space:pre-wrap;word-break:break-all;max-height:22vh;overflow:auto}" +
      "#gg-trigger-panel .gg-dot{display:inline-block;width:8px;height:8px;border-radius:50%;" +
      "background:#d0d7de;margin-right:6px;vertical-align:middle}" +
      "#gg-trigger-panel .gg-dot.on{background:#1f883d}" +
      "#gg-trigger-panel .gg-dot.err{background:#cf222e}" +
      "#gg-trigger-panel .gg-hint{margin-top:8px;color:#6e7781;font-size:12px}";
    document.head.appendChild(s);
  }

  /* ---------- 进度浮层 ---------- */
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "gg-trigger-panel";
    panel.style.display = "none";
    panel.innerHTML =
      '<div class="gg-t"><span><span class="gg-dot"></span><span class="gg-ttl">更新数据</span></span>' +
      '<button class="gg-x" type="button" aria-label="关闭">&times;</button></div>' +
      '<div class="gg-b"><div class="gg-msg"></div><div class="gg-log"></div><div class="gg-hint"></div></div>';
    document.body.appendChild(panel);
    titleEl = panel.querySelector(".gg-ttl");
    bodyEl = panel.querySelector(".gg-msg");
    panel.querySelector(".gg-x").addEventListener("click", function () {
      if (!busy) panel.style.display = "none";
    });
    return panel;
  }

  function show(state, msg, log, hint) {
    ensurePanel();
    panel.style.display = "";
    var dot = panel.querySelector(".gg-dot");
    dot.className = "gg-dot" + (state === "on" ? " on" : state === "err" ? " err" : "");
    if (titleEl) titleEl.textContent = "更新数据";
    if (bodyEl) bodyEl.textContent = msg || "";
    var logEl = panel.querySelector(".gg-log");
    logEl.textContent = log || "";
    logEl.style.display = log ? "" : "none";
    var hintEl = panel.querySelector(".gg-hint");
    hintEl.textContent = hint || "";
    hintEl.style.display = hint ? "" : "none";
  }

  function hidePanel() {
    if (panel) panel.style.display = "none";
  }

  function tailLines(tail, n) {
    if (!tail) return [];
    var lines = tail.split("\n").filter(function (l) {
      return l.trim().length > 0;
    });
    return lines.slice(-(n || 6));
  }

  /* ---------- 浮动按钮 ---------- */
  function ensureButton() {
    if (btn && document.body.contains(btn)) return btn;
    btn = document.createElement("button");
    btn.id = "gg-trigger-btn";
    btn.type = "button";
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>' +
      '<path d="M21 3v5h-5"/>' +
      '<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>' +
      '<path d="M8 16H3v5"/></svg>' +
      '<span class="gg-btn-text">更新数据</span>';
    btn.title = "从本机重新采集小红书数据并更新看板（约 1-3 分钟）";
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      run();
    });
    document.body.appendChild(btn);
    return btn;
  }

  function setLabel(text) {
    currentLabel = text;
    if (!btn) return;
    var t = btn.querySelector(".gg-btn-text");
    if (t) t.textContent = text;
    var svg = btn.querySelector("svg");
    if (svg) {
      if (text === "采集中…" || text === "提交中…" || text === "检查中…") {
        svg.classList.add("gg-spin");
      } else {
        svg.classList.remove("gg-spin");
      }
    }
    if (text === "已完成") {
      btn.classList.add("gg-ok");
    } else {
      btn.classList.remove("gg-ok");
    }
  }

  /* ---------- 主流程 ---------- */
  function run() {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    setLabel("提交中…");
    show("on", "正在通知本机触发服务…", [], "采集期间请不要关闭页面，完成后会自动刷新。");

    fetch(BASE + "/trigger", { method: "POST" })
      .then(function (r) {
        if (r.status === 409) return { ok: true, message: "已有任务在运行" };
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function () {
        return poll();
      })
      .catch(function (err) {
        busy = false;
        btn.disabled = false;
        setLabel("更新数据");
        show(
          "err",
          "无法连接本机触发服务。",
          [String(err && err.message ? err.message : err)],
          "请双击项目里的「启动数据服务.command」启动服务后重试；" +
            "若已启动，确认它正在监听 127.0.0.1:8899。"
        );
      });
  }

  function poll() {
    var startedAt = Date.now();
    return new Promise(function (resolve, reject) {
      function tick() {
        fetch(BASE + "/status", { cache: "no-store" })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          })
          .then(function (st) {
            var elapsed = st.elapsed != null ? st.elapsed : Math.round((Date.now() - startedAt) / 1000);
            if (st.running) {
              setLabel("采集中…");
              show("on", "正在采集 / 分析，已用时 " + elapsed + " 秒", tailLines(st.tail, 6));
              if (Date.now() - startedAt > MAX_WAIT_MS) {
                finish(false, "采集超时（超过 35 分钟），请查看本机日志。", st);
                resolve();
                return;
              }
              setTimeout(tick, POLL_MS);
              return;
            }

            // 采集已结束
            if (st.exit_code !== 0) {
              finish(false, "采集失败（退出码 " + st.exit_code + "）", st);
              resolve();
              return;
            }

            // 采集成功 —— 数据已在本地 commit，检查是否还有提交没推到线上。
            // 推送失败（代理抖动）不算采集失败，触发服务会在后台持续重试。
            if (st.ahead > 0) {
              setLabel("部署中…");
              var deployMsg = st.deploying
                ? "采集完成，正在部署到线上（后台第 " + st.deploy_attempts + " 次重试）…"
                : "采集完成，等待部署…";
              show(
                "on",
                deployMsg + "\n还有 " + st.ahead + " 个提交待推送，数据已安全保存在本地。",
                tailLines(st.tail, 6)
              );
              if (Date.now() - startedAt > MAX_WAIT_MS) {
                finish(
                  true,
                  "采集完成，但线上部署仍在后台重试（代理不通时常见），稍后刷新即可看到新数据。",
                  st
                );
                resolve();
                return;
              }
              setTimeout(tick, POLL_MS);
              return;
            }

            // 已全部推送到线上
            finish(true, "采集完成，已推送到线上", st);
            resolve();
          })
          .catch(reject);
      }
      tick();
    });
  }

  function finish(ok, msg, st) {
    busy = false;
    btn.disabled = false;
    setLabel(ok ? "已完成" : "重试更新");
    var lines = tailLines(st && st.tail, 12);
    show(ok ? "on" : "err", msg, lines, ok ? "页面即将自动刷新…" : "");

    if (ok) {
      setTimeout(function () {
        show("on", "正在刷新页面…", tailLines(st && st.tail, 3), "稍等，正在绕过 CDN 缓存拉取最新数据。");
      }, 800);
      setTimeout(function () {
        var url = location.origin + location.pathname + "?_=" + Date.now();
        location.replace(url);
      }, 2400);
    }
  }

  /* ---------- 保活 ----------
   * 页面有 React hydration 不匹配（error #418），React 会重建整个容器，
   * 把我们 append 到 body 的按钮一起清掉。所以每 2 秒检查一次，没了就重建。
   */
  function keepAlive() {
    if (!document.body) return;
    if (btn && document.body.contains(btn)) return;
    var wasBusy = busy;
    btn = null;
    ensureButton();
    if (wasBusy) {
      btn.disabled = true;
      setLabel(currentLabel);
    }
  }

  /* ---------- 启动 ---------- */
  function boot() {
    injectStyle();
    ensureButton();
    setInterval(keepAlive, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();