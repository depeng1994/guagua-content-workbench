const GG_SCHEDULE = (() => {
  const series = [
    {id:"SER-01", name:"商超自救指南", color:"#7652CF", order:1},
    {id:"SER-02", name:"咖啡的N种活法", color:"#3165D5", order:2},
    {id:"SER-03", name:"看懂母婴生意", color:"#9B6C16", order:3},
    {id:"SER-04", name:"智驾天团", color:"#14808F", order:4},
    {id:"SER-05", name:"安踏品牌局", color:"#AB4D7F", order:5},
    {id:"SER-06", name:"AI商业地图", color:"#5158BC", order:6},
    {id:"SER-07", name:"餐饮万店命题", color:"#B46935", order:7},
    {id:"SER-OTHER", name:"其他内容", color:"#647187", order:8},
  ];
  const items = [
    ["2026-08-05","商超自救指南","永辉胖改","商超自救指南｜“胖改”后的永辉怎么样了？","已发布"],
    ["2026-08-06","智驾天团","Momenta","智驾天团｜智驾背后的外包大脑Momenta🚗","已发布"],
    ["2026-08-07","其他内容","东鹏饮料","除了大金瓶，你喝过东鹏家第二种饮料吗？🥤","已发布"],
    ["2026-08-11","商超自救指南","盒马","千亿GMV，盒马到底做对了什么？","已发布"],
    ["2026-08-13","商超自救指南","山姆会员费","大家都在排队挤山姆，但260 元年费真的值吗？","已发布"],
    ["2026-08-18","商超自救指南","商超经营差异","永辉盒马山姆，为什么越做越不一样？","已发布"],
    ["2026-08-20","其他内容","小米中报","小米中报｜Q2收入回来了，毛利率还在跌？","已发布"],
    ["2026-08-24","商超自救指南","商超自有品牌","山姆、盒马、永辉，为什么都在做自有品牌？","已发布"],
    ["2026-08-26","咖啡的N种活法","咖啡成本","一杯咖啡的钱，到底被谁赚走了？☕","已发布"],
    ["2026-08-28","咖啡的N种活法","瑞幸／库迪","9块9之后，瑞幸和库迪为什么走向了两条路？","已发布"],
    ["2026-08-31","咖啡的N种活法","Manner／M Stand","Manner和M Stand，为什么越做越不像？","已发布"],
    ["2026-09-02","咖啡的N种活法","星巴克","星巴克，为什么不跟9块9打到底？☕️","已发布"],
    ["2026-09-02","其他内容","账号介绍","🔝瓜瓜看经营，到底看什么？","已发布"],
    ["2026-09-04","看懂母婴生意","母婴总览","宝宝越来越少，母婴生意为什么还在变大？🍼","已发布"],
    ["2026-09-07","看懂母婴生意","全棉时代","棉柔巾之后，全棉时代的增长靠什么？","已发布"],
    ["2026-09-09","看懂母婴生意","Babycare","全品类生意，Babycare是怎么跑起来的？","已排期"],
    ["2026-09-11","智驾天团","智驾总览","都在做智驾，为什么做的不是同一门生意？","已排期"],
    ["2026-09-14","智驾天团","引望（华为乾崑）","华为乾崑，为什么越来越不像一家普通智驾供应商？","已排期"],
    ["2026-09-16","看懂母婴生意","好孩子","好孩子待定，重点讲高端品牌运营策略，看了研究素材再决定","已排期"],
    ["2026-09-18","看懂母婴生意","孩子王","重点补齐服务驱动这条线，要体现跟全棉时代、babycare产品路线的区别","已排期"],
    ["2026-09-21","安踏品牌局","安踏品牌局总览","安踏自己不高端，为什么能管这么多中高端品牌？","已排期"],
    ["2026-09-23","安踏品牌局","FILA","一个亏损品牌，为什么后来比安踏自己还赚钱？","已排期"],
    ["2026-09-25","智驾天团","地平线×卓驭","芯片公司和方案公司为什么都在往完整智驾方案走？","已排期"],
    ["2026-09-28","智驾天团","千里科技×小鹏","车企体系里的智驾能力，为什么都开始寻找外部价值？","已排期"],
    ["2026-09-30","AI商业地图","AI产业链","AI这么火，真正赚钱的到底是谁？","已排期"],
    ["2026-10-02","AI商业地图","OpenAI×Anthropic","两个最重要的大模型公司，为什么越走越不一样？","已排期"],
    ["2026-10-05","安踏品牌局","DESCENTE×KOLON SPORT","迪桑特和可隆都卖高端户外，为什么不互相打架？","已排期"],
    ["2026-10-07","安踏品牌局","Amer Sports×始祖鸟","始祖鸟爆火，到底是不是安踏的功劳？","已排期"],
    ["2026-10-09","AI商业地图","AI资本局｜海外篇","科技巨头投资模型公司，到底在抢什么？","已排期"],
    ["2026-10-12","AI商业地图","AI资本局｜中国篇","中国大厂投资AI公司，到底在布局什么？","已排期"],
    ["2026-10-14","安踏品牌局","PUMA","安踏为什么敢碰PUMA？过去的方法还能复制吗？","已排期"],
    ["2026-10-16","餐饮万店命题","餐饮规模化总览","餐饮这么难复制，为什么有些公司却能开到上千甚至几万家？","已排期"],
    ["2026-10-19","餐饮万店命题","蜜雪冰城","6万家门店背后，蜜雪真正复制的到底是什么？","已排期"],
    ["2026-10-21","AI商业地图","AI办公入口争夺","有办公入口的大厂，为什么还要继续抢AI？","已排期"],
    ["2026-10-23","AI商业地图","智谱×MiniMax","没有超级App和云业务托底，独立大模型公司怎么活？","已排期"],
    ["2026-10-26","餐饮万店命题","海底捞","服务这么依赖人，海底捞为什么还能把组织复制到上千家店？","已排期"],
    ["2026-10-28","餐饮万店命题","萨莉亚","这么便宜还坚持直营，萨莉亚怎么把一家餐厅变成可复制的工业系统？","已排期"],
    ["2026-10-30","餐饮万店命题","万店之后的第二增长","当一种东西已经复制到极限，下一步到底该复制什么？","已排期"],
  ].map((x,i)=>({id:`GG-S-${String(i+1).padStart(3,"0")}`,date:x[0],series:x[1],content:x[2],title:x[3],status:x[4]}));

  const bySeries = new Map(series.map(s=>[s.name,s]));
  const esc = (v="") => String(v).replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const pad = n=>String(n).padStart(2,"0");
  const parse = s=>new Date(`${s}T12:00:00`);
  const fmtMD = s=>{const d=parse(s); return `${pad(d.getMonth()+1)}.${pad(d.getDate())}`};
  const fmtYMD = d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const addDays = (d,n)=>{const x=new Date(d); x.setDate(x.getDate()+n); return x};
  const monday = d=>{const x=new Date(d); const w=(x.getDay()+6)%7; return addDays(x,-w)};
  const weekLabel = d=>`${pad(d.getMonth()+1)}.${pad(d.getDate())} — ${pad(addDays(d,6).getMonth()+1)}.${pad(addDays(d,6).getDate())}`;
  const today = "2026-09-08";

  function filtered(state){
    const q=state.q.trim().toLowerCase();
    return items.filter(it=>{
      if(state.series!=="全部系列" && it.series!==state.series) return false;
      if(state.status!=="全部状态" && it.status!==state.status) return false;
      if(q && !`${it.content} ${it.title} ${it.series}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function stats(list){
    return {
      total:list.length,
      published:list.filter(x=>x.status==="已发布").length,
      planned:list.filter(x=>x.status==="已排期").length
    };
  }

  const css = `
  #guagua-schedule-override{font-family:inherit;color:var(--ink-1,#1f2937)}
  .gg-original-hidden{display:none!important}
  .gg-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
  .gg-toolbar-left,.gg-toolbar-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .gg-switch{display:inline-flex;padding:3px;background:#f3f4f6;border-radius:9px}
  .gg-switch button{border:0;background:transparent;padding:6px 11px;border-radius:7px;font-size:13px;font-weight:500;color:#7a8190;cursor:pointer}
  .gg-switch button.active{background:#fff;color:#242936;box-shadow:0 1px 3px rgba(15,23,42,.08)}
  .gg-input,.gg-select{height:32px;border:1px solid #e1e5ec;background:#fff;border-radius:8px;padding:0 10px;font-size:12px;color:#4b5563;outline:none}
  .gg-input{width:190px}
  .gg-stats{display:flex;gap:7px;margin:2px 0 12px;flex-wrap:wrap}
  .gg-stat{font-size:11px;color:#7a8190;background:#f7f8fa;border:1px solid #edf0f4;border-radius:999px;padding:4px 8px}
  .gg-stat b{color:#444b59;font-weight:600}
  .gg-scroll{overflow:auto;border:1px solid #e6e9ef;border-radius:12px;background:#fff}
  .gg-overview{display:grid;grid-template-columns:156px repeat(var(--weeks),126px);min-width:max-content}
  .gg-cell{min-height:72px;border-right:1px solid #eef0f4;border-bottom:1px solid #eef0f4;padding:7px}
  .gg-head{min-height:44px;background:#fafbfc;font-size:11px;color:#8b92a0;display:flex;align-items:center;justify-content:center;text-align:center}
  .gg-series-cell{position:sticky;left:0;z-index:2;background:#fff;display:flex;flex-direction:column;justify-content:center;padding:10px 12px}
  .gg-head.gg-series-cell{z-index:3;background:#fafbfc}
  .gg-series-name{font-size:14px;font-weight:500;line-height:1.25}
  .gg-series-count{font-size:12px;font-weight:400;color:#9aa1b1;margin-top:4px}
  .gg-plan{--c:#647187;border:1px solid color-mix(in srgb,var(--c) 22%,#e7eaf0);background:color-mix(in srgb,var(--c) 7%,#fff);border-radius:7px;padding:6px 7px;margin-bottom:5px;min-width:0}
  .gg-plan:last-child{margin-bottom:0}
  .gg-plan-title{font-size:12px;font-weight:400;line-height:1.28;color:color-mix(in srgb,var(--c) 62%,#626978);word-break:break-word}
  .gg-plan-meta{display:flex;align-items:center;gap:5px;margin-top:4px;font-size:11px;font-weight:400;color:#9aa1b1}
  .gg-dot{width:5px;height:5px;border-radius:50%;background:var(--c);opacity:.72;flex:none}
  .gg-empty{color:#c5cad3;font-size:12px;display:flex;align-items:center;justify-content:center;height:100%}
  .gg-calendar-card{border:1px solid #e6e9ef;border-radius:12px;background:#fff;overflow:hidden}
  .gg-cal-top{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #edf0f4}
  .gg-cal-title{font-size:14px;font-weight:600;color:#3b4250}
  .gg-cal-nav{display:flex;align-items:center;gap:6px}
  .gg-cal-nav button{border:1px solid #e2e6ed;background:#fff;border-radius:7px;height:28px;min-width:30px;padding:0 8px;cursor:pointer;color:#6b7280}
  .gg-cal-grid{display:grid;grid-template-columns:repeat(7,1fr)}
  .gg-dow{padding:7px;text-align:center;background:#fafbfc;color:#9aa1b1;font-size:11px;border-right:1px solid #eef0f4;border-bottom:1px solid #eef0f4}
  .gg-day{min-height:112px;padding:7px;border-right:1px solid #eef0f4;border-bottom:1px solid #eef0f4;background:#fff}
  .gg-day.out{background:#fbfcfd;color:#c5cad3}
  .gg-day.today{box-shadow:inset 0 0 0 1px #b9c0cc}
  .gg-day-num{font-size:11px;font-weight:400;color:#7c8390;margin-bottom:5px}
  .gg-day.out .gg-day-num{color:#c5cad3}
  .gg-cal-item{--c:#647187;border-left:2px solid var(--c);background:color-mix(in srgb,var(--c) 7%,#fff);padding:4px 5px;margin:4px 0;border-radius:4px}
  .gg-cal-item b{display:block;font-size:11px;font-weight:500;line-height:1.25;color:color-mix(in srgb,var(--c) 64%,#5f6674)}
  .gg-cal-item span{display:block;font-size:10px;color:#9aa1b1;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gg-detail-wrap{border:1px solid #e6e9ef;border-radius:12px;background:#fff;overflow:auto}
  .gg-detail{width:100%;border-collapse:collapse;min-width:900px}
  .gg-detail th{background:#fafbfc;color:#8a91a0;font-size:11px;font-weight:500;padding:8px 10px;text-align:left;border-bottom:1px solid #e8ebf0}
  .gg-detail td{padding:9px 10px;border-bottom:1px solid #eef0f4;font-size:12px;color:#5e6674;vertical-align:top}
  .gg-detail tr:last-child td{border-bottom:0}
  .gg-series-pill{--c:#647187;display:inline-flex;align-items:center;gap:5px;color:color-mix(in srgb,var(--c) 64%,#626978);font-weight:500}
  .gg-status{display:inline-block;font-size:10px;padding:2px 6px;border-radius:999px;background:#f2f4f7;color:#7d8491;white-space:nowrap}
  .gg-status.published{background:#eef7f1;color:#568065}
  .gg-title-cell{max-width:460px;line-height:1.45}
  @media(max-width:900px){
    .gg-toolbar{align-items:flex-start}
    .gg-toolbar-left,.gg-toolbar-right{width:100%}
    .gg-input{flex:1;min-width:140px}
    .gg-overview{grid-template-columns:140px repeat(var(--weeks),118px)}
    .gg-day{min-height:96px;padding:5px}
  }`;

  function renderOverview(root,state){
    const list=filtered(state);
    const minDate=parse("2026-08-03"), maxDate=parse("2026-11-01");
    const weeks=[]; for(let d=new Date(minDate); d<=maxDate; d=addDays(d,7)) weeks.push(new Date(d));
    const rows=series.map(s=>{
      const own=list.filter(it=>it.series===s.name);
      const cells=weeks.map(w=>{
        const end=addDays(w,6);
        const here=own.filter(it=>{const d=parse(it.date); return d>=w && d<=end});
        return `<div class="gg-cell">${here.length?here.map(it=>`
          <div class="gg-plan" style="--c:${s.color}" title="${esc(it.title)}">
            <div class="gg-plan-title">${esc(it.content)}</div>
            <div class="gg-plan-meta"><span class="gg-dot"></span><span>${fmtMD(it.date)}</span><span>·</span><span>${esc(it.status)}</span></div>
          </div>`).join(""):`<div class="gg-empty">—</div>`}</div>`;
      }).join("");
      return `<div class="gg-cell gg-series-cell" style="--c:${s.color}">
        <div class="gg-series-name" style="color:color-mix(in srgb,${s.color} 62%,#626978)">${esc(s.name)}</div>
        <div class="gg-series-count">${own.length} 篇</div>
      </div>${cells}`;
    }).join("");
    root.innerHTML=`<div class="gg-scroll"><div class="gg-overview" style="--weeks:${weeks.length}">
      <div class="gg-cell gg-head gg-series-cell">系列</div>
      ${weeks.map(w=>`<div class="gg-cell gg-head">${weekLabel(w)}</div>`).join("")}
      ${rows}
    </div></div>`;
  }

  function monthGrid(state){
    const [y,m]=state.month.split("-").map(Number);
    const first=new Date(y,m-1,1,12), start=monday(first);
    const end=new Date(y,m,0,12);
    const weeks=Math.ceil((Math.floor((end-start)/86400000)+1)/7);
    const days=[]; for(let i=0;i<weeks*7;i++) days.push(addDays(start,i));
    return {y,m,days};
  }

  function renderCalendar(root,state,rerender){
    const list=filtered(state), {y,m,days}=monthGrid(state);
    root.innerHTML=`<div class="gg-calendar-card">
      <div class="gg-cal-top">
        <div class="gg-cal-title">${y} 年 ${m} 月</div>
        <div class="gg-cal-nav"><button data-cal="-1" aria-label="上个月">‹</button><button data-cal="today">本月</button><button data-cal="1" aria-label="下个月">›</button></div>
      </div>
      <div class="gg-cal-grid">
        ${["一","二","三","四","五","六","日"].map(x=>`<div class="gg-dow">周${x}</div>`).join("")}
        ${days.map(d=>{
          const ds=fmtYMD(d), current=d.getMonth()===m-1;
          const here=list.filter(it=>it.date===ds);
          return `<div class="gg-day ${current?"":"out"} ${ds===today?"today":""}">
            <div class="gg-day-num">${d.getDate()}</div>
            ${here.map(it=>{const s=bySeries.get(it.series)||series.at(-1);return `<div class="gg-cal-item" style="--c:${s.color}" title="${esc(it.title)}"><b>${esc(it.content)}</b><span>${esc(it.series)} · ${esc(it.status)}</span></div>`}).join("")}
          </div>`
        }).join("")}
      </div>
    </div>`;
    root.querySelectorAll("[data-cal]").forEach(btn=>btn.addEventListener("click",()=>{
      const v=btn.dataset.cal;
      if(v==="today") state.month="2026-09";
      else{
        const [yy,mm]=state.month.split("-").map(Number);
        const d=new Date(yy,mm-1+Number(v),1,12);
        state.month=`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
      }
      rerender();
    }));
  }

  function renderDetail(root,state){
    const list=filtered(state).slice().sort((a,b)=>b.date.localeCompare(a.date));
    root.innerHTML=`<div class="gg-detail-wrap"><table class="gg-detail">
      <thead><tr><th>日期</th><th>系列</th><th>内容</th><th>标题</th><th>状态</th></tr></thead>
      <tbody>${list.map(it=>{const s=bySeries.get(it.series)||series.at(-1);return `<tr>
        <td>${fmtMD(it.date)}</td>
        <td><span class="gg-series-pill" style="--c:${s.color}"><span class="gg-dot"></span>${esc(it.series)}</span></td>
        <td>${esc(it.content)}</td>
        <td class="gg-title-cell">${esc(it.title)}</td>
        <td><span class="gg-status ${it.status==="已发布"?"published":""}">${esc(it.status)}</span></td>
      </tr>`}).join("")}</tbody>
    </table></div>`;
  }

  function syncChrome(){
    document.querySelectorAll(".side-tabs button").forEach(btn=>{
      if(btn.textContent.includes("内容与排期")){
        const c=btn.querySelector(".tab-count"); if(c)c.textContent=String(items.length);
      }
    });
    const ds=document.querySelector(".source-strip .desktop-only");
    if(ds) ds.textContent="· 15 篇已发布 · 23 篇已排期";
  }

  function mount(){
    const original=document.querySelector(".schedule-page");
    if(!original || document.getElementById("guagua-schedule-override")) return false;
    const root=document.createElement("div");
    root.id="guagua-schedule-override";
    original.insertAdjacentElement("afterend",root);
    original.classList.add("gg-original-hidden");
    if(!document.getElementById("guagua-schedule-override-style")){
      const style=document.createElement("style"); style.id="guagua-schedule-override-style"; style.textContent=css; document.head.appendChild(style);
    }
    const state={view:"overview",q:"",series:"全部系列",status:"全部状态",month:"2026-09"};
    root.innerHTML=`<div class="gg-toolbar">
      <div class="gg-toolbar-left">
        <div class="gg-switch">
          <button data-view="overview" class="active">整体</button>
          <button data-view="calendar">月历</button>
          <button data-view="detail">明细表</button>
        </div>
      </div>
      <div class="gg-toolbar-right">
        <input class="gg-input" type="search" placeholder="搜索内容" aria-label="搜索内容">
        <select class="gg-select gg-series-select" aria-label="内容系列">
          <option>全部系列</option>${series.map(s=>`<option>${esc(s.name)}</option>`).join("")}
        </select>
        <select class="gg-select gg-status-select" aria-label="内容状态">
          <option>全部状态</option><option>已发布</option><option>已排期</option>
        </select>
      </div>
    </div><div class="gg-stats"></div><div class="gg-content"></div>`;
    const content=root.querySelector(".gg-content"), statBox=root.querySelector(".gg-stats");
    const rerender=()=>{
      root.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
      const st=stats(filtered(state));
      statBox.innerHTML=`<span class="gg-stat">全部 <b>${st.total}</b></span><span class="gg-stat">已发布 <b>${st.published}</b></span><span class="gg-stat">已排期 <b>${st.planned}</b></span>`;
      if(state.view==="overview")renderOverview(content,state);
      else if(state.view==="calendar")renderCalendar(content,state,rerender);
      else renderDetail(content,state);
    };
    root.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{state.view=b.dataset.view;rerender()}));
    root.querySelector(".gg-input").addEventListener("input",e=>{state.q=e.target.value;rerender()});
    root.querySelector(".gg-series-select").addEventListener("change",e=>{state.series=e.target.value;rerender()});
    root.querySelector(".gg-status-select").addEventListener("change",e=>{state.status=e.target.value;rerender()});
    syncChrome();
    rerender();
    return true;
  }

  function boot(){
    if(mount()) return;
    const obs=new MutationObserver(()=>{ if(mount()) obs.disconnect(); });
    obs.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>obs.disconnect(),15000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true}); else boot();

  return {series,items};
})();
