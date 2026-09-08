// Patch only the schedule data inside the exported RSC snapshot.
// The original React components and CSS continue to render overview / calendar / list views.
const PLAN_DATE = "2026-09-08";

const PLANS = [
  { id: "GG-P001", short: "Babycare", date: "2026-09-09", seriesId: "SER-03", title: "全品类生意，Babycare是怎么跑起来的？" },
  { id: "GG-P003", short: "智驾总览", date: "2026-09-11", seriesId: "SER-04", title: "都在做智驾，为什么做的不是同一门生意？" },
  { id: "GG-P005", short: "引望（华为乾崑）", date: "2026-09-14", seriesId: "SER-04", title: "华为乾崑，为什么越来越不像一家普通智驾供应商？" },
  { id: "GG-P006", short: "好孩子", date: "2026-09-16", seriesId: "SER-03", title: "好孩子待定，重点讲高端品牌运营策略，看了研究素材再决定" },
  { id: "GG-P007", short: "孩子王", date: "2026-09-18", seriesId: "SER-03", title: "重点补齐服务驱动这条线，要体现跟全棉时代、babycare产品路线的区别" },
  { id: "GG-P004", short: "安踏品牌局总览", matchShort: "安踏品牌局", date: "2026-09-21", seriesId: "SER-05", title: "安踏自己不高端，为什么能管这么多中高端品牌？" },
  { id: "GG-P008", short: "FILA", date: "2026-09-23", seriesId: "SER-05", title: "一个亏损品牌，为什么后来比安踏自己还赚钱？" },
  { id: "GG-P009", short: "地平线×卓驭", date: "2026-09-25", seriesId: "SER-04", title: "芯片公司和方案公司为什么都在往完整智驾方案走？" },
  { id: "GG-P010", short: "千里科技×小鹏", date: "2026-09-28", seriesId: "SER-04", title: "车企体系里的智驾能力，为什么都开始寻找外部价值？" },
  { id: "GG-P011", short: "AI产业链", date: "2026-09-30", seriesId: "SER-06", title: "AI这么火，真正赚钱的到底是谁？" },
  { id: "GG-P012", short: "OpenAI×Anthropic", date: "2026-10-02", seriesId: "SER-06", title: "两个最重要的大模型公司，为什么越走越不一样？" },
  { id: "GG-P013", short: "DESCENTE×KOLON SPORT", date: "2026-10-05", seriesId: "SER-05", title: "迪桑特和可隆都卖高端户外，为什么不互相打架？" },
  { id: "GG-P014", short: "Amer Sports×始祖鸟", date: "2026-10-07", seriesId: "SER-05", title: "始祖鸟爆火，到底是不是安踏的功劳？" },
  { id: "GG-P015", short: "AI资本局｜海外篇", date: "2026-10-09", seriesId: "SER-06", title: "科技巨头投资模型公司，到底在抢什么？" },
  { id: "GG-P016", short: "AI资本局｜中国篇", date: "2026-10-12", seriesId: "SER-06", title: "中国大厂投资AI公司，到底在布局什么？" },
  { id: "GG-P017", short: "PUMA", date: "2026-10-14", seriesId: "SER-05", title: "安踏为什么敢碰PUMA？过去的方法还能复制吗？" },
  { id: "GG-P018", short: "餐饮规模化总览", date: "2026-10-16", seriesId: "SER-07", title: "餐饮这么难复制，为什么有些公司却能开到上千甚至几万家？" },
  { id: "GG-P019", short: "蜜雪冰城", date: "2026-10-19", seriesId: "SER-07", title: "6万家门店背后，蜜雪真正复制的到底是什么？" },
  { id: "GG-P020", short: "AI办公入口争夺", date: "2026-10-21", seriesId: "SER-06", title: "有办公入口的大厂，为什么还要继续抢AI？" },
  { id: "GG-P021", short: "智谱×MiniMax", date: "2026-10-23", seriesId: "SER-06", title: "没有超级App和云业务托底，独立大模型公司怎么活？" },
  { id: "GG-P022", short: "海底捞", date: "2026-10-26", seriesId: "SER-07", title: "服务这么依赖人，海底捞为什么还能把组织复制到上千家店？" },
  { id: "GG-P023", short: "萨莉亚", date: "2026-10-28", seriesId: "SER-07", title: "这么便宜还坚持直营，萨莉亚怎么把一家餐厅变成可复制的工业系统？" },
  { id: "GG-P024", short: "万店之后的第二增长", date: "2026-10-30", seriesId: "SER-07", title: "当一种东西已经复制到极限，下一步到底该复制什么？" },
];

function patchContents(contents) {
  const result = contents.map((item) => ({ ...item }));

  for (const plan of PLANS) {
    const matchShort = plan.matchShort || plan.short;
    let item = result.find((x) => x.id === plan.id) || result.find((x) => x.short === matchShort);

    if (item) {
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
