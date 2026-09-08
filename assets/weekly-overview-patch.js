// Keep the original React overview as the source of truth, but present a weekly mirror.
// One column = one Monday-Sunday week. The original table container provides horizontal scrolling.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_COL_WIDTH = 160;
const SERIES_COL_WIDTH = 174;
const UNDATED_COL_WIDTH = 196;

function parseDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function mondayOf(date) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() - (result.getUTCDay() + 6) % 7);
  return result;
}

function cardDate(card) {
  const title = card.getAttribute("title") || "";
  const match = title.match(/·\s*(\d{4}-\d{2}-\d{2})\s*·/);
  if (match) return match[1];
  return card.querySelector("time[datetime]")?.getAttribute("datetime") || null;
}

function formatShort(value) {
  return value.slice(5).replace("-", ".");
}

function copyAttributes(source, target) {
  for (const attr of source.attributes) target.setAttribute(attr.name, attr.value);
}

function buildWeeks(sourceTable) {
  const dates = [...sourceTable.querySelectorAll("article.plan-item")]
    .map(cardDate)
    .filter(Boolean)
    .sort();

  if (!dates.length) return [];

  const start = mondayOf(parseDate(dates[0]));
  const lastMonday = mondayOf(parseDate(dates[dates.length - 1]));
  const count = Math.floor((lastMonday.getTime() - start.getTime()) / WEEK_MS) + 1;

  return Array.from({ length: count }, (_, index) => {
    const weekStart = new Date(start.getTime() + index * WEEK_MS);
    const weekEnd = new Date(weekStart.getTime() + 6 * DAY_MS);
    return { start: iso(weekStart), end: iso(weekEnd) };
  });
}

function sourceSignature(sourceTable) {
  const rows = [...sourceTable.querySelectorAll("tbody tr")]
    .map((row) => row.querySelector(".overview-series strong")?.textContent?.trim() || "")
    .join("|");
  const cards = [...sourceTable.querySelectorAll("article.plan-item")]
    .map((card) => `${card.getAttribute("title") || ""}::${card.className}`)
    .join("|");
  return `${rows}##${cards}`;
}

function makeWeekHeader(template, week) {
  const th = template.cloneNode(false);
  const label = document.createElement("span");
  label.textContent = `${formatShort(week.start)} — ${formatShort(week.end)}`;
  th.appendChild(label);

  const small = document.createElement("small");
  small.textContent = "周排期";
  th.appendChild(small);
  return th;
}

function makeWeekCell(template, cards) {
  const td = template.cloneNode(false);
  td.classList.remove("undated-cell");
  if (!td.classList.contains("overview-cell")) td.classList.add("overview-cell");

  if (!cards.length) {
    const empty = document.createElement("span");
    empty.className = "cell-empty";
    empty.textContent = "—";
    td.appendChild(empty);
    return td;
  }

  const stack = document.createElement("div");
  stack.className = "overview-stack";
  cards
    .sort((a, b) => (cardDate(a) || "").localeCompare(cardDate(b) || ""))
    .forEach((card) => stack.appendChild(card.cloneNode(true)));
  td.appendChild(stack);
  return td;
}

function buildWeeklyTable(sourceTable, weeks) {
  const table = document.createElement("table");
  copyAttributes(sourceTable, table);
  table.classList.add("guagua-weekly-table");
  table.removeAttribute("style");

  const totalWidth = SERIES_COL_WIDTH + weeks.length * WEEK_COL_WIDTH + UNDATED_COL_WIDTH;
  table.style.width = `${totalWidth}px`;
  table.style.minWidth = `${totalWidth}px`;
  table.style.tableLayout = "fixed";

  const sourceColgroup = sourceTable.querySelector("colgroup");
  const colgroup = sourceColgroup ? sourceColgroup.cloneNode(false) : document.createElement("colgroup");
  const seriesCol = sourceColgroup?.querySelector(".overview-series-col")?.cloneNode(true) || document.createElement("col");
  seriesCol.className = "overview-series-col";
  colgroup.appendChild(seriesCol);
  weeks.forEach(() => {
    const col = document.createElement("col");
    col.className = "overview-week-col";
    col.style.width = `${WEEK_COL_WIDTH}px`;
    colgroup.appendChild(col);
  });
  const undatedCol = sourceColgroup?.querySelector(".overview-undated-col")?.cloneNode(true) || document.createElement("col");
  undatedCol.className = "overview-undated-col";
  colgroup.appendChild(undatedCol);
  table.appendChild(colgroup);

  const sourceHead = sourceTable.tHead;
  if (sourceHead?.rows?.length) {
    const thead = sourceHead.cloneNode(false);
    const sourceRow = sourceHead.rows[0];
    const row = sourceRow.cloneNode(false);
    const cells = [...sourceRow.cells];
    const first = cells[0];
    const middleTemplate = cells[1] || first;
    const last = cells[cells.length - 1];
    row.appendChild(first.cloneNode(true));
    weeks.forEach((week) => row.appendChild(makeWeekHeader(middleTemplate, week)));
    row.appendChild(last.cloneNode(true));
    thead.appendChild(row);
    table.appendChild(thead);
  }

  const sourceBody = sourceTable.tBodies[0];
  if (sourceBody) {
    const tbody = sourceBody.cloneNode(false);
    [...sourceBody.rows].forEach((sourceRow) => {
      const row = sourceRow.cloneNode(false);
      const cells = [...sourceRow.cells];
      if (cells.length < 2) return;

      const first = cells[0];
      const last = cells[cells.length - 1];
      const middleCells = cells.slice(1, -1);
      const middleTemplate = middleCells[0] || last;
      const cards = middleCells.flatMap((cell) => [...cell.querySelectorAll("article.plan-item")]);

      row.appendChild(first.cloneNode(true));
      weeks.forEach((week) => {
        const weekCards = cards.filter((card) => {
          const date = cardDate(card);
          return date && date >= week.start && date <= week.end;
        });
        row.appendChild(makeWeekCell(middleTemplate, weekCards));
      });
      row.appendChild(last.cloneNode(true));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
  }

  return table;
}

function renderWeeklyOverview() {
  const panels = [...document.querySelectorAll(".overview-panel")];
  for (const panel of panels) {
    const sourceTable = [...panel.querySelectorAll(".overview-table")]
      .find((table) => !table.classList.contains("guagua-weekly-table"));
    if (!sourceTable) continue;

    const weeks = buildWeeks(sourceTable);
    if (!weeks.length) continue;

    const container = sourceTable.parentElement;
    if (!container) continue;

    const signature = `${sourceSignature(sourceTable)}##${weeks.map((week) => week.start).join("|")}`;
    const currentMirror = container.querySelector(":scope > .guagua-weekly-table");
    if (currentMirror?.dataset.signature === signature) {
      sourceTable.style.display = "none";
      continue;
    }

    const mirror = buildWeeklyTable(sourceTable, weeks);
    mirror.dataset.signature = signature;
    if (currentMirror) currentMirror.replaceWith(mirror);
    else sourceTable.insertAdjacentElement("afterend", mirror);
    sourceTable.style.display = "none";
  }
}

function installStyles() {
  if (document.getElementById("guagua-weekly-overview-style")) return;
  const style = document.createElement("style");
  style.id = "guagua-weekly-overview-style";
  style.textContent = `
    .guagua-weekly-table { table-layout: fixed !important; }
    .guagua-weekly-table .overview-series-col { width: ${SERIES_COL_WIDTH}px; }
    .guagua-weekly-table .overview-week-col { width: ${WEEK_COL_WIDTH}px; }
    .guagua-weekly-table .overview-undated-col { width: ${UNDATED_COL_WIDTH}px; }
  `;
  document.head.appendChild(style);
}

let scheduled = false;
function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    renderWeeklyOverview();
  });
}

installStyles();
scheduleRender();

const observer = new MutationObserver((mutations) => {
  if (mutations.every((mutation) => mutation.target.closest?.(".guagua-weekly-table"))) return;
  scheduleRender();
});
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class", "title"],
});

window.addEventListener("pageshow", scheduleRender);
