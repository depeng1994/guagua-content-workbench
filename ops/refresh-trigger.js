/* 瓜瓜内容工作台 · 「更新数据」按钮
 *
 * 接管页面上原有的「刷新数据」按钮：点击后请求本机的触发服务
 * (ops/trigger_server.py)，由它在本机跑 ops/run_daily.sh 完成
 * 采集 -> 分析 -> 同步 -> 提交推送，完成后自动刷新页面拉最新数据。
 *
 * 这一段是内联进 index.html 的，不能用 ES module 语法。
 */
(function () {
  "use strict";

  var BASE = "http://127.0.0.1:8899";
  var POLL_MS = 3000;
  var MAX_WAIT_MS = 20 * 60 * 1000;
  var busy = false;
  var btn = null;
  var panel = null;
  var bodyEl = null;
  var titleEl = null;

  /* ---------- 注入样式 ---------- */
  function injectStyle() {
    if (document.getElementById("gg-trigger-style")) return;
    var s = document.createElement("style");
    s.id = "gg-trigger-style";
    s.textContent =
      "#gg-trigger-panel{position:fixed;right:20px;bottom:20px;z-index:99999;" +
      "width:360px;max-width:calc(100vw - 40px);background:#fff;color:#1f2328;" +
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
    injectStyle();
    panel = document.createElement("div");
    panel.id = "gg-trigger-panel";
    panel.innerHTML =
      '<div class="gg-t"><span><span class="gg-dot"></span><span class="gg-ttl">更新数据</span></span>' +
      '<button class="gg-x" type="button" aria-label="关闭">&times;</button></div>' +
      '<div class="gg-b"><div class="gg-msg"></div><div class="gg-log"></div><div class="gg-hint"></div></div>';
    document.body.appendChild(panel);
    titleEl = panel.querySelector(".gg-ttl");
    bodyEl = panel.querySelector(".gg-msg");
    panel.querySelector(".gg-x").addEventListener("click", function () {
      if (busy) {
        panel.style.display = "none";
      } else {
        close();
      }
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

  function close() {
    if (panel) panel.style.display = "none";
  }

  function tailLines(tail, n) {
    if (!tail) return "";
    var lines = tail.split("\n").filter(function (l) {
      return l.trim().length > 0;
    });
    return lines.slice(-(n || 6)).join("\n");
  }

  /* ---------- 按钮外观 ---------- */
  function setLabel(text) {
    if (!btn) return;
    for (var i = btn.childNodes.length - 1; i >= 0; i--) {
      var n = btn.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) {
        n.nodeValue = text;
        return;
      }
    }
  }

  function setSpin(on) {
    if (!btn) return;
    var svg = btn.querySelector("svg");
    if (svg) svg.setAttribute("class", on ? "spin" : "");
  }

  /* ---------- 找到并接管按钮 ---------- */
  function findButton() {
    var all = document.querySelectorAll("button");
    for (var i = 0; i < all.length; i++) {
      var b = all[i];
      var t = (b.textContent || "").trim();
      if (
        t.indexOf("刷新数据") !== -1 ||
        t.indexOf("读取中") !== -1 ||
        t.indexOf("更新数据") !== -1 ||
        t.indexOf("重试更新") !== -1
      ) {
        return b;
      }
    }
    return null;
  }

  function hijack() {
    btn = findButton();
    if (!btn || btn.dataset.ggTrigger === "1") return false;
    btn.dataset.ggTrigger = "1";
    btn.title = "从本机重新采集小红书数据并更新看板（约 1-3 分钟）";

    // React 把监听挂在根容器上，这里在冒泡阶段先截断事件，
    // 避免它自带的空逻辑（会把按钮打回「读取中…」）干扰。
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      run();
    });

    setLabel("更新数据");
    return true;
  }

  /* ---------- 主流程 ---------- */
  function run() {
    if (busy) return;
    busy = true;
    if (btn) btn.disabled = true;
    setSpin(true);
    setLabel("提交中…");
    show("on", "正在通知本机触发服务…", "", "采集期间请不要关闭页面，完成后会自动刷新。");

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
        if (btn) btn.disabled = false;
        setSpin(false);
        setLabel("更新数据");
        show(
          "err",
          "无法连接本机触发服务。",
          String(err && err.message ? err.message : err),
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
              show("on", "正在采集 / 分析 / 推送，已用时 " + elapsed + " 秒", tailLines(st.tail, 6));
              if (Date.now() - startedAt > MAX_WAIT_MS) {
                finish(false, "采集超时（超过 20 分钟），请查看本机日志。", st);
                resolve();
                return;
              }
              setTimeout(tick, POLL_MS);
              return;
            }
            // 已结束
            if (st.exit_code === 0) {
              finish(true, "采集完成，正在部署到线上…", st);
              resolve();
            } else {
              finish(false, "采集失败（退出码 " + st.exit_code + "）", st);
              resolve();
            }
          })
          .catch(reject);
      }
      tick();
    });
  }

  function finish(ok, msg, st) {
    busy = false;
    if (btn) btn.disabled = false;
    setSpin(false);
    setLabel(ok ? "更新数据" : "重试更新");
    show(ok ? "on" : "err", msg, tailLines(st && st.tail, 12), ok ? "页面即将自动刷新…" : "");

    if (ok) {
      show("on", "已完成，正在刷新页面…", tailLines(st && st.tail, 4), "稍等，正在绕过 CDN 缓存拉取最新数据。");
      setTimeout(function () {
        var url = location.origin + location.pathname + "?_=" + Date.now();
        location.replace(url);
      }, 2000);
    }
  }

  /* ---------- 启动：等 hydration 完成 ---------- */
  function boot() {
    if (hijack()) {
      watch();
      return;
    }
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (hijack() || tries > 40) {
        clearInterval(timer);
        watch();
      }
    }, 300);
  }

  /* hydration 有可能重建按钮节点，兜住丢失/被还原的情况 */
  function watch() {
    setInterval(function () {
      if (busy) return;
      if (!btn || !document.body.contains(btn)) {
        btn = null;
        hijack();
        return;
      }
      var t = (btn.textContent || "").trim();
      if (t.indexOf("更新数据") === -1 && t.indexOf("重试更新") === -1) {
        setLabel("更新数据");
      }
    }, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
