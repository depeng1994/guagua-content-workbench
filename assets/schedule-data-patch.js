// Patch only the schedule data inside the exported RSC snapshot.
// The original React components and CSS continue to render overview / calendar / list views.
const PLAN_DATE = "2026-09-08";

const PLANS = [];
// 上面这份硬编码排期（2026-09-08 快照）已废弃：主表现在由飞书同步提供完整
// 排期。旧快照的 id 与主表会错位（例：旧快照 GG-P005 是「引望」，主表
// GG-P005 却是「万店之后的第二增长」），按 id 匹配会把两条内容搅在一起，
// 导致同一篇被渲染两次。保留空数组以兼容 patchContents 的结构。

function patchContents(contents) {
  const result = contents.map((item) => ({ ...item }));

  for (const plan of PLANS) {
    const matchShort = plan.matchShort || plan.short;
    let item = result.find((x) => x.id === plan.id) || result.find((x) => x.short === matchShort);

    if (item) {
      // 已发布的内容不要再覆盖回「已排期」——否则创作者后台发布后，排期页
      // 还会强制把它打回时钟状态（Babycare GG-P001 就是这个 bug）。
      if (item.status === "已发布") {
        continue;
      }
      item.id = plan.id;
      item.short = plan.short;
      item.title = plan.title;
      item.seriesId = plan.seriesId;
      item.status = "已排期";
      item.publishedDate = null;
      item.plannedDate = plan.date;
      item.statusNote = "已纳入内容排期";
      item.evidenceDate = PLAN_DATE;
      continue;
    }

    result.push({
      id: plan.id,
      title: plan.title,
      short: plan.short,
      format: "待定",
      status: "已排期",
      publishedDate: null,
      plannedDate: plan.date,
      noteId: null,
      sourceUrl: null,
      researchUrl: null,
      figmaUrl: null,
      feishuRecordUrl: null,
      durationSeconds: null,
      question: null,
      statusNote: "已纳入内容排期",
      evidenceDate: PLAN_DATE,
      seriesId: plan.seriesId,
    });
  }

  return result;
}

function patchSeries(series) {
  const result = series.map((item) => ({ ...item }));
  const other = result.find((x) => x.id === "SER-OTHER");
  if (other) other.order = 8;

  if (!result.some((x) => x.id === "SER-07")) {
    result.push({
      id: "SER-07",
      name: "餐饮万店命题",
      color: "#B46935",
      order: 7,
      aliases: ["餐饮", "万店"],
    });
  }

  return result.sort((a, b) => (a.order || 99) - (b.order || 99));
}

function patchRscChunk(chunk) {
  if (typeof chunk !== "string" || !chunk.includes('"contents":[') || !chunk.includes('],"snapshots":[')) {
    return chunk;
  }

  try {
    const contentsMatch = chunk.match(/"contents":(\[[\s\S]*?\]),"snapshots":/);
    const seriesMatch = chunk.match(/"series":(\[[\s\S]*?\])\},"source":/);
    if (!contentsMatch || !seriesMatch) return chunk;

    const contents = patchContents(JSON.parse(contentsMatch[1]));
    const series = patchSeries(JSON.parse(seriesMatch[1]));

    return chunk
      .replace(contentsMatch[0], `"contents":${JSON.stringify(contents)},"snapshots":`)
      .replace(seriesMatch[0], `"series":${JSON.stringify(series)}},"source":`);
  } catch (error) {
    console.error("[guagua] schedule data patch failed", error);
    return chunk;
  }
}

const chunks = (self.__VINEXT_RSC_CHUNKS__ ||= []);
for (let i = 0; i < chunks.length; i += 1) chunks[i] = patchRscChunk(chunks[i]);

const nativePush = chunks.push.bind(chunks);
chunks.push = (...values) => nativePush(...values.map(patchRscChunk));

import("./weekly-overview-patch.js").catch((error) => {
  console.error("[guagua] weekly overview patch failed to load", error);
});
