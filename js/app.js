import { chipRow, tabBar, tagList, listOf, pickList, entityHead, placeTip, onClicks } from "./components.js";
import { loadData } from "./data.js";

// ---------- 資料 ----------
const { REGIONS, REGION_OF, COUNTRIES, WH_NOTE, EVENTS, JP_AREAS, PREFS, JP_NATIONAL, PICKS, SOURCE_NAMES, TOPO, JPTOPO } = await loadData();
// 日本國定假日與各縣祭典定義在 data/japan.json，這裡併入月曆使用的 EVENTS
for (const e of JP_NATIONAL) EVENTS.push({c: "JP", ...e});
for (const p of PREFS) for (const e of p.ev) EVENTS.push({c: "JP", t: "F", ...e, p: p.id});
const PREF_BY_ID = Object.fromEntries(PREFS.map(p => [p.id, p]));
// 節慶清單與當月活動數（依賴程式狀態，所以放在這裡而不是 components.js）
const eventList = (xs, empty, ...opts) => listOf(xs, x => itemHTML(x, ...opts), empty);
const monthCount = pred => ALL.filter(x => pred(x) && inMonth(x) && st.types[x.t]).length;
// 每月推薦：picks.json 依月份、國家存放
const monthPicks = code => (PICKS[st.m + 1] || {})[code] || [];
const sourceName = url => {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const key = Object.keys(SOURCE_NAMES).find(d => host === d || host.endsWith("." + d));
  return key ? SOURCE_NAMES[key] : host;
};

const YEARS = [2026, 2027];
const TABS = [["ev","節慶", (c, e) => e.length], ["s","景點", c => c.s.length], ["nat","自然景色", c => (c.nat || []).length], ["wh","世界遺產", c => (c.wh || []).length]];
const WK = {"文":"cul","自":"nat","複":"mix"}, WN = {"文":"文化","自":"自然","複":"複合"};
const TYPE_N = {H:"國定假日", F:"祭典活動", S:"旅遊季節"};
const RN = Object.fromEntries(REGIONS.map(r => [r.k, r.n]));
const ISO_REGION = {};
for (const [k, s] of Object.entries(REGION_OF)) for (const id of s.split(" ")) ISO_REGION[id] = k;
const ISO_CODE = {};
for (const [code, c] of Object.entries(COUNTRIES)) if (c.iso) ISO_CODE[c.iso] = code;

// ---------- 日期展開 ----------
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function mk(y, md){ const [m, d] = md.split("-").map(Number); return new Date(y, m-1, d); }
function instances(){
  const out = [];
  EVENTS.forEach((e, i) => {
    for (const y of [2025, ...YEARS]){
      const spec = e.d || (e.y && e.y[y]);
      if (!spec) continue;
      const [a, b] = spec.split("~");
      const s = mk(y, a); let en = b ? mk(y, b) : mk(y, a);
      if (en < s) en = mk(y+1, b);
      out.push({...e, id:`${i}-${y}`, ei:i, s, e:en, r:COUNTRIES[e.c].r});
    }
  });
  return out;
}
const ALL = instances();

// ---------- 狀態 ----------
const now = new Date();
const today = ymd(now);
const st = {
  y: YEARS.includes(now.getFullYear()) ? now.getFullYear() : YEARS[0],
  m: YEARS.includes(now.getFullYear()) ? now.getMonth() : 0,
  region: null, country: null, ev: null, q: "", tab: "pk", pref: null, ptab: "s", area: null,
  types: {H:true, F:true, S:true}
};
try { const saved = JSON.parse(localStorage.getItem("fest-types")); if (saved) Object.assign(st.types, saved); } catch(_) {}

function matches(x, ignoreCountry){
  if (!st.types[x.t]) return false;
  if (st.region && x.r !== st.region) return false;
  if (!ignoreCountry && st.country && x.c !== st.country) return false;
  if (st.q){
    const q = st.q.toLowerCase();
    const c = COUNTRIES[x.c];
    if (!(x.n.toLowerCase().includes(q) || c.n.includes(q) || x.x.includes(q) || RN[x.r].includes(q) || (x.p && PREF_BY_ID[x.p].n.includes(q)))) return false;
  }
  return true;
}
const mStart = () => new Date(st.y, st.m, 1);
const mEnd = () => new Date(st.y, st.m+1, 0);
const inMonth = x => x.s <= mEnd() && x.e >= mStart();
const monthEvents = ign => ALL.filter(x => inMonth(x) && matches(x, ign)).sort((a,b) => a.s - b.s || a.e - b.e);

function fmtRange(x){
  const f = d => `${d.getMonth()+1}/${d.getDate()}`;
  return +x.s === +x.e ? f(x.s) : `${f(x.s)}–${f(x.e)}`;
}

// ---------- 地圖 ----------
const svg = d3.select("#map");
const W = 960, H = 470;
svg.attr("viewBox", `0 0 ${W} ${H}`);
const geo = topojson.feature(TOPO, TOPO.objects.countries);
geo.features = geo.features.filter(f => f.id !== "010");
const proj = d3.geoNaturalEarth1().fitExtent([[6, 6], [W-6, H-6]], geo);
const path = d3.geoPath(proj);
const gRoot = svg.append("g");
const paths = gRoot.append("g").selectAll("path").data(geo.features).join("path")
  .attr("class", f => "c" + (ISO_CODE[f.id] ? " has" : ""))
  .attr("d", path)
  .attr("fill", f => ISO_REGION[f.id] ? `var(--r-${ISO_REGION[f.id]})` : "var(--land-off)");
const pinData = Object.entries(COUNTRIES).filter(([, c]) => c.pin).map(([code, c]) => ({code, c, p:proj(c.pin)}));
const pins = gRoot.append("g").selectAll("g").data(pinData).join("g").attr("class", "pin")
  .attr("transform", d => `translate(${d.p[0]},${d.p[1]})`);
pins.append("circle").attr("r", 4.5).attr("fill", d => `var(--r-${d.c.r})`);

const zoom = d3.zoom().scaleExtent([1, 9]).translateExtent([[0,0],[W,H]])
  .filter(ev => ev.type === "wheel" ? (ev.ctrlKey || ev.metaKey) : (!ev.touches || ev.touches.length > 1) && !ev.button)
  .on("zoom", ev => {
    gRoot.attr("transform", ev.transform);
    pins.select("circle").attr("r", 4.5 / Math.sqrt(ev.transform.k));
  });
svg.call(zoom).on("dblclick.zoom", null);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const tr = () => reduce ? svg : svg.transition().duration(650);
document.getElementById("zin").onclick = () => tr().call(zoom.scaleBy, 1.6);
document.getElementById("zout").onclick = () => tr().call(zoom.scaleBy, 1/1.6);
document.getElementById("zreset").onclick = () => tr().call(zoom.transform, d3.zoomIdentity);

function zoomToRegion(rk){
  if (!rk){ tr().call(zoom.transform, d3.zoomIdentity); return; }
  const feats = geo.features.filter(f => ISO_REGION[f.id] === rk && f.id !== "643" && f.id !== "304");
  // 俄羅斯、格陵蘭面積太大，用主要國家算範圍
  let [[x0,y0],[x1,y1]] = [[Infinity,Infinity],[-Infinity,-Infinity]];
  for (const f of feats){
    const pieces = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.map(c => ({type:"Polygon", coordinates:c})) : [f.geometry];
    // 只取最大的幾塊，避開海外領地（例如法屬圭亞那）
    pieces.map(p => ({p, a:d3.geoArea(p)})).sort((a,b) => b.a - a.a).slice(0, 3).forEach(({p}) => {
      const [[a,b],[c,d]] = path.bounds(p);
      if (c - a > W*0.6) return;
      x0 = Math.min(x0,a); y0 = Math.min(y0,b); x1 = Math.max(x1,c); y1 = Math.max(y1,d);
    });
  }
  for (const pd of pinData) if (pd.c.r === rk){ x0 = Math.min(x0,pd.p[0]); x1 = Math.max(x1,pd.p[0]); y0 = Math.min(y0,pd.p[1]); y1 = Math.max(y1,pd.p[1]); }
  if (rk === "EE"){ const p = proj([60, 56]); x1 = Math.max(x1, p[0]); }
  const k = Math.min(8, 0.85 / Math.max((x1-x0)/W, (y1-y0)/H));
  const cx = (x0+x1)/2, cy = (y0+y1)/2;
  tr().call(zoom.transform, d3.zoomIdentity.translate(W/2 - k*cx, H/2 - k*cy).scale(k));
}

const tip = document.getElementById("tip");
function showTip(ev, code, iso){
  let html;
  if (code){
    const c = COUNTRIES[code];
    const n = monthCount(x => x.c === code);
    const wh = c.wh ? c.wh.length : 0;
    html = `${c.f} <b>${c.n}</b>　${RN[c.r]}<br><span style="color:var(--muted)">${st.m+1} 月 ${n} 項活動${wh ? `・世界遺產 ${wh} 處` : ""}・點擊查看</span>`;
  } else {
    const f = geo.features.find(f => f.id === iso);
    html = `${f ? f.properties.name : ""}　<span style="color:var(--muted)">${RN[ISO_REGION[iso]] || ""}</span>`;
  }
  placeTip(tip, document.querySelector(".map-card"), ev, html);
}
paths.on("mousemove", (ev, f) => showTip(ev, ISO_CODE[f.id], f.id)).on("mouseleave", () => tip.hidden = true)
  .on("click", (ev, f) => { const code = ISO_CODE[f.id]; if (code) selectCountry(code); else if (ISO_REGION[f.id]) setRegion(ISO_REGION[f.id]); });
pins.on("mousemove", (ev, d) => showTip(ev, d.code)).on("mouseleave", () => tip.hidden = true)
  .on("click", (ev, d) => selectCountry(d.code));

function paintMap(){
  const active = new Set(monthEvents(true).map(x => x.c));
  paths
    .attr("fill-opacity", f => {
      const code = ISO_CODE[f.id];
      if (st.region && ISO_REGION[f.id] !== st.region) return .18;
      return code && active.has(code) ? 1 : .38;
    })
    .classed("sel", f => ISO_CODE[f.id] === st.country);
  pins.attr("opacity", d => st.region && d.c.r !== st.region ? .25 : active.has(d.code) ? 1 : .5)
    .classed("sel", d => d.code === st.country);
  // 讓選取的國家畫在最上層，框線才不會被鄰國蓋住
  paths.filter(".sel").raise();
}

// ---------- 區域圖例 ----------
function renderRegions(){
  const el = document.getElementById("regions");
  const counts = {};
  for (const c of Object.values(COUNTRIES)) counts[c.r] = (counts[c.r] || 0) + 1;
  el.innerHTML = chipRow("r", st.region, "全部地區", REGIONS.map(r => ({v: r.k, label: r.n, dot: r.k, n: counts[r.k] || 0, title: `${r.n}：收錄 ${counts[r.k] || 0} 個國家`})));
  onClicks(el, "button", b => setRegion(b.dataset.r || null));
  // 第二層：選定區域後列出該區國家
  const cr = document.getElementById("crow");
  cr.hidden = !st.region;
  if (!st.region){ cr.innerHTML = ""; return; }
  const list = Object.entries(COUNTRIES).filter(([, c]) => c.r === st.region);
  cr.innerHTML = `<span class="lab"><i class="dot" style="width:9px;height:9px;border-radius:50%;background:var(--r-${st.region})"></i>${RN[st.region]}的國家<small>數字＝${st.m+1} 月活動數</small></span>` +
    chipRow("c", st.country, "全部國家", list.map(([code, c]) => { const n = monthCount(x => x.c === code); return {v: code, label: `${c.f} ${c.n}`, n, title: `${c.n}：${st.m+1} 月共 ${n} 項活動`}; }));
  onClicks(cr, "button", b => {
    if (!b.dataset.c){ st.country = null; st.ev = null; render(); return; }
    selectCountry(b.dataset.c);
  });
}

// ---------- 控制列 ----------
const yearSel = document.getElementById("year");
yearSel.innerHTML = YEARS.map(y => `<option value="${y}">${y} 年</option>`).join("");
yearSel.onchange = () => { st.y = +yearSel.value; st.ev = null; render(); };
document.getElementById("prev").onclick = () => shiftMonth(-1);
document.getElementById("next").onclick = () => shiftMonth(1);
function shiftMonth(d){
  let m = st.m + d, y = st.y;
  if (m < 0){ m = 11; y--; } if (m > 11){ m = 0; y++; }
  if (!YEARS.includes(y)) return;
  st.m = m; st.y = y; st.ev = null; render();
}
document.querySelectorAll(".tbtn").forEach(b => b.onclick = () => {
  st.types[b.dataset.t] = !st.types[b.dataset.t];
  try { localStorage.setItem("fest-types", JSON.stringify(st.types)); } catch(_) {}
  render();
});
document.getElementById("q").oninput = e => { st.q = e.target.value.trim(); render(); };

function setRegion(r){
  st.region = st.region === r ? null : r;
  if (st.country && st.region && COUNTRIES[st.country].r !== st.region) st.country = null;
  zoomToRegion(st.region);
  render();
}
function selectCountry(code){
  st.country = st.country === code ? null : code;
  st.ev = null;
  if (st.country && COUNTRIES[code].r !== st.region){ st.region = COUNTRIES[code].r; zoomToRegion(st.region); }
  render();
  if (st.country && innerWidth <= 900) document.getElementById("side").scrollIntoView({behavior: reduce ? "auto" : "smooth", block:"start"});
}
function selectEvent(id){
  const x = ALL.find(a => a.id === id);
  st.ev = st.ev === id ? null : id;
  if (st.ev){
    st.country = x.c;
    st.tab = "ev";
    if (x.p){ st.pref = x.p; st.ptab = "ev"; }
    if (x.s.getFullYear() === st.y || x.e.getFullYear() === st.y){
      if (!inMonth(x)){ st.m = x.s.getFullYear() === st.y ? x.s.getMonth() : 0; }
    }
  }
  render();
}

// ---------- 月曆 ----------
function renderCalendar(){
  document.getElementById("mtitle").textContent = `${st.y} 年 ${st.m+1} 月`;
  yearSel.value = st.y;
  document.getElementById("prev").disabled = st.y === YEARS[0] && st.m === 0;
  document.getElementById("next").disabled = st.y === YEARS.at(-1) && st.m === 11;
  document.getElementById("months").innerHTML = Array.from({length:12}, (_, i) =>
    `<button data-m="${i}" aria-current="${i === st.m}" aria-label="${i+1} 月">${i+1}</button>`).join("");
  document.querySelectorAll("#months button").forEach(b => b.onclick = () => { st.m = +b.dataset.m; st.ev = null; render(); });

  const evs = monthEvents(false).filter(x => x.t !== "S");
  const sel = st.ev ? ALL.find(a => a.id === st.ev) : null;
  const first = mStart(), last = mEnd();
  const lead = first.getDay();
  const total = Math.ceil((lead + last.getDate()) / 7) * 7;
  const maxChips = innerWidth <= 620 ? 4 : 3;
  let html = "";
  for (let i = 0; i < total; i++){
    const day = new Date(st.y, st.m, i - lead + 1);
    const out = day.getMonth() !== st.m;
    const key = ymd(day);
    if (out){ html += `<div class="cell out" aria-hidden="true"></div>`; continue; }
    const starts = evs.filter(x => ymd(x.s) === key || (day.getDate() === 1 && x.s < first));
    const ongoing = evs.filter(x => x.s < day && x.e >= day && !starts.includes(x)).length;
    const span = sel && sel.s <= day && sel.e >= day;
    const open = st.openDay === key;
    const chips = starts.slice(0, open ? starts.length : maxChips).map(x => {
      const c = COUNTRIES[x.c];
      return `<button class="ev ${x.t}${x.s < first ? " cont" : ""}" data-id="${x.id}" title="${c.n}${x.p ? "・" + PREF_BY_ID[x.p].n : ""}・${x.n}（${fmtRange(x)}）">${c.f} ${x.n}</button>`;
    }).join("");
    const more = starts.length > maxChips ? `<button class="more" data-day="${key}" aria-expanded="${open}">${open ? "收合" : `＋${starts.length - maxChips} 項`}</button>` : "";
    html += `<div class="cell${key === today ? " today" : ""}${span ? " span" : ""}">
      <div class="dn"><b>${day.getDate()}</b>${ongoing ? `<span class="ongo">進行中 ${ongoing}</span>` : ""}</div>${chips}${more}</div>`;
  }
  const grid = document.getElementById("grid");
  grid.innerHTML = html;
  grid.querySelectorAll(".ev").forEach(b => b.onclick = () => selectEvent(b.dataset.id));
  onClicks(grid, ".more", b => { st.openDay = st.openDay === b.dataset.day ? null : b.dataset.day; renderCalendar(); });
}

// ---------- 側欄 ----------
function itemHTML(x, showCountry, hidePref){
  const c = COUNTRIES[x.c];
  const approx = x.a ? `<i>約</i>` : "";
  const sel = st.ev === x.id ? " on" : "";
  return `<li><button class="item${sel}" data-id="${x.id}" data-day-start="${ymd(x.s)}">
    <span class="dt">${fmtRange(x)}${approx}</span>
    <span><span class="nm">${showCountry ? c.f + " " : ""}${x.n}<span class="tag ${x.t}">${TYPE_N[x.t]}</span></span>
    ${showCountry ? `<span class="meta rg"><i style="background:var(--r-${x.r})"></i>${c.n}${x.p ? "・" + PREF_BY_ID[x.p].n : ""}・${RN[x.r]}</span>` : x.p && !hidePref ? `<span class="meta">${PREF_BY_ID[x.p].n}</span>` : ""}
    <span class="ds" style="display:block">${x.x}</span></span></button></li>`;
}
function renderSide(){
  const side = document.getElementById("side");
  let html = "";
  if (st.country){
    const c = COUNTRIES[st.country];
    const yearEvs = ALL.filter(x => x.c === st.country && (x.s.getFullYear() === st.y) && st.types[x.t]).sort((a,b) => a.s - b.s);
    // 有當月推薦時多一個分頁並預設打開；沒有時退回景點分頁
    const picks = monthPicks(st.country);
    const tabs = picks.length ? [["pk", `${st.m + 1} 月推薦`, () => picks.length], ...TABS] : TABS;
    const tab = st.tab === "pk" && !picks.length ? "s" : st.tab;
    html += `<div class="panel">
      ${entityHead({flag: c.f, name: c.n, color: c.r, sub: RN[c.r], btnId: "clearC", btnLabel: "看全部國家"})}
      ${c.warn ? `<p class="warn">${c.warn}</p>` : ""}
      ${st.country === "JP" ? `<button class="jp-link" id="toJP">查看 47 都道府縣的景點、遺跡與祭典 ↓</button>` : ""}
      ${tabBar("tab", tab, tabs, c, yearEvs)}
      ${tab === "pk" ? `<p class="pk-legend">熱門程度依台灣旅行社 ${st.m + 1} 月行程與旅遊網站推薦整理，★★★ 為最熱門。</p>${pickList(picks, sourceName, it => it.p ? `<p class="meta">${PREF_BY_ID[it.p].n}</p>` : "")}` : ""}
      ${tab === "ev" ? eventList(yearEvs, "這一年沒有符合篩選的項目", false) : ""}
      ${tab === "s" ? tagList(c.s) : ""}
      ${tab === "nat" ? tagList(c.nat || [], "nat") : ""}
      ${tab === "wh" ? (c.wh && c.wh.length ? `${tagList(c.wh, "wh", ([n, k]) => `<span class="wk ${WK[k]}">${WN[k]}</span>${n}`)}<p class="wh-legend">依聯合國教科文組織登錄類別分為文化、自然、複合遺產。</p>` : `<p class="empty">${WH_NOTE[st.country] || "目前沒有登錄的世界遺產。"}</p>`) : ""}
    </div>`;
  } else {
    const evs = monthEvents(false);
    const fest = evs.filter(x => x.t !== "S"), seas = evs.filter(x => x.t === "S");
    const byRegion = REGIONS.map(r => ({r, xs: fest.filter(x => x.r === r.k)})).filter(g => g.xs.length);
    html += `<div class="panel"><h3>${st.m+1} 月節慶活動<small>${fest.length} 項</small></h3>
      ${byRegion.map(g => `<div class="grp"><i class="sw" style="background:var(--r-${g.r.k});border-radius:50%"></i>${g.r.n}</div>${eventList(g.xs, "", true)}`).join("")
        || `<p class="empty">沒有符合條件的活動，試著放寬區域或類型篩選。</p>`}</div>`;
    if (st.types.S) html += `<div class="panel"><h3>${st.m+1} 月適合前往<small>${seas.length} 項</small></h3>
      ${eventList(seas, "沒有符合條件的旅遊季節", true)}</div>`;
  }
  side.innerHTML = html;
  onClicks(side, ".item", b => selectEvent(b.dataset.id));
  onClicks(side, "[data-tab]", b => { st.tab = b.dataset.tab; renderSide(); });
  const tj = document.getElementById("toJP");
  if (tj) tj.onclick = () => document.getElementById("jp").scrollIntoView({behavior: reduce ? "auto" : "smooth", block:"start"});
  const cc = document.getElementById("clearC");
  if (cc) cc.onclick = () => selectCountry(st.country);
}

function renderActive(){
  const el = document.getElementById("af");
  const pills = [];
  if (st.region) pills.push(`<span class="pill">區域：${RN[st.region]}<button data-k="region" aria-label="清除區域">✕</button></span>`);
  if (st.country) pills.push(`<span class="pill">只看 ${COUNTRIES[st.country].f} ${COUNTRIES[st.country].n}<button data-k="country" aria-label="清除國家">✕</button></span>`);
  if (st.q) pills.push(`<span class="pill">搜尋：${st.q}<button data-k="q" aria-label="清除搜尋">✕</button></span>`);
  el.innerHTML = pills.join("");
  el.querySelectorAll("button").forEach(b => b.onclick = () => {
    if (b.dataset.k === "region"){ st.region = null; zoomToRegion(null); }
    if (b.dataset.k === "country"){ st.country = null; st.ev = null; }
    if (b.dataset.k === "q"){ st.q = ""; document.getElementById("q").value = ""; }
    render();
  });
}

function render(){
  document.querySelectorAll(".tbtn").forEach(b => b.setAttribute("aria-pressed", st.types[b.dataset.t]));
  renderRegions(); renderActive(); renderCalendar(); renderSide(); paintMap(); renderJP(); renderJPList();
}
{
  const nc = Object.keys(COUNTRIES).length;
  const nwh = Object.values(COUNTRIES).reduce((a, c) => a + (c.wh ? c.wh.length : 0), 0);
  document.getElementById("sub").textContent = `${nc} 個國家的國定假日、祭典與最佳旅遊季節，附旅行團必去景點、自然景色與 ${nwh} 處世界遺產。點地圖上的國家或下方的區域就能篩選。`;
}
// ---------- 日本都道府縣 ----------
const AREA_BY = Object.fromEntries(JP_AREAS.map(a => [a.k, a]));
const JW = 600, JH = 560;
const jsvg = d3.select("#jpmap").attr("viewBox", `0 0 ${JW} ${JH}`);
const jfc = topojson.feature(JPTOPO, JPTOPO.objects.p);
// 主島範圍：排除東京都（小笠原）與沖繩，沖繩另以左上角小框顯示
const mainland = {type:"FeatureCollection", features: jfc.features.filter(f => f.id !== "13" && f.id !== "47")};
const jproj = d3.geoIdentity().fitExtent([[150, 10], [JW - 10, JH - 10]], mainland);
const jpath = d3.geoPath(jproj);
const jg = jsvg.append("g");
// 沖繩小框只放沖繩本島、宮古、八重山，略過東方遠離的大東群島
{
  const f = jfc.features.find(f => f.id === "47");
  const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
  const pc = polys.map(c => ({c, a: Math.abs(d3.polygonArea(c[0])), x: d3.polygonCentroid(c[0])[0]}));
  const mainX = pc.reduce((m, p) => p.a > m.a ? p : m).x;
  f.geometry = {type:"MultiPolygon", coordinates: pc.filter(p => p.x <= mainX + 2).map(p => p.c)};
}
const okiF = jfc.features.find(f => f.id === "47");
const [[ox0, oy0], [ox1, oy1]] = jpath.bounds(okiF);
const oScale = Math.min(220 / (ox1 - ox0), 180 / (oy1 - oy0));
const okiT = `translate(${22 - ox0 * oScale},${40 - oy0 * oScale}) scale(${oScale})`;
jg.append("rect").attr("class", "inset").attr("x", 10).attr("y", 26).attr("width", 244).attr("height", 204).attr("rx", 6);
jg.append("text").attr("x", 16).attr("y", 20).text("沖繩縣");
const jpaths = jg.append("g").selectAll("path").data(jfc.features).join("path")
  .attr("d", jpath)
  .attr("transform", f => f.id === "47" ? okiT : null)
  .attr("vector-effect", "non-scaling-stroke")
  .attr("fill", f => `var(--r-${AREA_BY[PREF_BY_ID[f.id].a].c})`);
const jtip = document.getElementById("jptip");
jpaths.on("mousemove", (ev, f) => {
  const p = PREF_BY_ID[f.id];
  const n = monthCount(x => x.p === f.id);
  placeTip(jtip, document.querySelector(".jp-map-card"), ev, `<b>${p.n}</b>　${AREA_BY[p.a].n}地方<br><span style="color:var(--muted)">${st.m+1} 月 ${n} 項活動${p.wh.length ? `・世界遺產 ${p.wh.length}` : ""}</span>`);
}).on("mouseleave", () => jtip.hidden = true)
  .on("click", (ev, f) => selectPref(f.id));

function selectPref(id){
  st.pref = st.pref === id ? null : id;
  renderJP();
  if (st.pref && innerWidth <= 900) document.getElementById("pref").scrollIntoView({behavior: reduce ? "auto" : "smooth", block:"start"});
}
const PTABS = [["s","景點", p => p.s.length], ["h","遺跡・史蹟", p => p.h.length], ["wh","世界遺產", p => p.wh.length], ["ev","祭典活動", (p, e) => e.length]];
function renderJP(){
  // 日本 47 都道府縣只在選到日本時顯示
  const jpOn = st.country === "JP";
  document.getElementById("jp").hidden = !jpOn;
  if (!jpOn) return;
  const areasEl = document.getElementById("areas");
  areasEl.innerHTML = chipRow("a", st.area, "全部地方", JP_AREAS.map(a => { const n = PREFS.filter(p => p.a === a.k).length; return {v: a.k, label: a.n, dot: a.c, n, title: `${a.n}地方：${n} 個都道府縣`}; }));
  onClicks(areasEl, "button", b => { st.area = b.dataset.a && st.area !== b.dataset.a ? b.dataset.a : null; renderJP(); renderJPList(); });
  const active = new Set(ALL.filter(x => x.p && inMonth(x) && st.types[x.t]).map(x => x.p));
  jpaths.attr("fill-opacity", f => st.area && PREF_BY_ID[f.id].a !== st.area ? .15 : active.has(f.id) ? 1 : .45)
    .classed("sel", f => f.id === st.pref);
  jpaths.filter(".sel").raise();

  const el = document.getElementById("pref");
  if (!st.pref){
    const areas = JP_AREAS.filter(a => !st.area || a.k === st.area);
    el.innerHTML = `<h3>選擇都道府縣<small>${st.m+1} 月有活動的縣市以深色標示</small></h3>
      <div class="pref-index">${areas.map(a => `<div class="row"><span class="lab"><i class="sw" style="background:var(--r-${a.c});border-radius:50%"></i>${a.n}</span>
        ${PREFS.filter(p => p.a === a.k).map(p => `<button class="pbtn" data-p="${p.id}">${p.n}${active.has(p.id) ? `<small>●</small>` : ""}</button>`).join("")}</div>`).join("")}</div>`;
    el.querySelectorAll(".pbtn").forEach(b => b.onclick = () => selectPref(b.dataset.p));
    return;
  }
  const p = PREF_BY_ID[st.pref], ar = AREA_BY[p.a];
  const evs = ALL.filter(x => x.p === p.id && x.s.getFullYear() === st.y && st.types[x.t]).sort((a, b) => a.s - b.s);
  const list = (arr, cls) => arr.length ? tagList(arr, cls) : `<p class="empty">此縣沒有登錄的世界遺產。</p>`;
  el.innerHTML = `${entityHead({name: p.n, color: ar.c, sub: `${ar.n}地方`, btnId: "clearP", btnLabel: "全部縣市"})}
    ${tabBar("ptab", st.ptab, PTABS, p, evs)}
    ${st.ptab === "s" ? list(p.s, "") : ""}
    ${st.ptab === "h" ? list(p.h, "hist") : ""}
    ${st.ptab === "wh" ? list(p.wh, "wh") : ""}
    ${st.ptab === "ev" ? eventList(evs, `${st.y} 年沒有符合篩選的活動`, false, true) : ""}`;
  onClicks(el, "[data-ptab]", b => { st.ptab = b.dataset.ptab; renderJP(); });
  el.querySelector("#clearP").onclick = () => selectPref(st.pref);
  el.querySelectorAll(".item").forEach(b => b.onclick = () => {
    selectEvent(b.dataset.id);
    document.querySelector(".cal").scrollIntoView({behavior: reduce ? "auto" : "smooth", block:"start"});
  });
}

// ---------- 日本縣市一覽 ----------
st.jpView = "map"; st.jpq = "";
const esc = s => String(s).replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
const prefEvents = p => ALL.filter(x => x.p === p.id && x.s.getFullYear() === st.y).sort((a, b) => a.s - b.s);
const prefText = p => [p.n, ...p.s, ...p.h, ...p.wh, ...prefEvents(p).map(x => x.n + x.x)].join(" ");
const visiblePrefs = () => PREFS.filter(p => (!st.area || p.a === st.area) && (!st.jpq || prefText(p).includes(st.jpq)));
document.querySelectorAll(".seg button").forEach(b => b.onclick = () => { st.jpView = b.dataset.view; renderJPList(); });
document.getElementById("jpq").oninput = e => { st.jpq = e.target.value.trim(); renderJPList(); };
function renderJPList(){
  const list = st.jpView === "list";
  document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-selected", b.dataset.view === st.jpView));
  document.getElementById("jpgrid").hidden = list;
  document.getElementById("jpq").hidden = !list;
  document.getElementById("jpcopy").hidden = !list;
  const el = document.getElementById("jplist");
  el.hidden = !list;
  if (!list){ document.getElementById("jpmd").hidden = true; document.getElementById("jpcopymsg").textContent = ""; return; }
  const ps = visiblePrefs();
  const hl = s => st.jpq ? esc(s).split(esc(st.jpq)).join(`<mark>${esc(st.jpq)}</mark>`) : esc(s);
  const evTxt = x => `${hl(x.n)} <span class="d">${fmtRange(x)}${x.a ? "（約）" : ""}</span>`;
  el.innerHTML = JP_AREAS.map(a => {
    const g = ps.filter(p => p.a === a.k);
    if (!g.length) return "";
    return `<section><h3 class="al"><i class="sw" style="background:var(--r-${a.c});border-radius:50%"></i>${a.n}地方<small>${g.length}</small></h3>
      <div class="pcards">${g.map(p => {
        const evs = prefEvents(p);
        return `<article class="pc"><h4><button data-p="${p.id}" title="在地圖上查看">${p.n}</button><small>世界遺產 ${p.wh.length}・祭典 ${evs.length}</small></h4>
          <dl><dt>景點</dt><dd>${p.s.map(hl).join("、")}</dd>
          <dt>遺跡・史蹟</dt><dd>${p.h.map(hl).join("、")}</dd>
          <dt>世界遺產</dt><dd>${p.wh.length ? p.wh.map(hl).join("、") : "—"}</dd>
          <dt>祭典活動</dt><dd>${evs.map(evTxt).join("、") || "—"}</dd></dl></article>`;
      }).join("")}</div></section>`;
  }).join("") || `<p class="empty">找不到符合「${esc(st.jpq)}」的縣市。</p>`;
  el.querySelectorAll("[data-p]").forEach(b => b.onclick = () => {
    st.pref = b.dataset.p; st.jpView = "map";
    renderJP(); renderJPList();
    document.getElementById("jp").scrollIntoView({behavior: reduce ? "auto" : "smooth", block:"start"});
  });
}
document.getElementById("jpcopy").onclick = () => {
  const ps = visiblePrefs();
  const md = `# 日本都道府縣景點・祭典筆記（${st.y} 年）\n\n` + JP_AREAS.map(a => {
    const g = ps.filter(p => p.a === a.k);
    if (!g.length) return "";
    return `## ${a.n}地方\n\n` + g.map(p => `### ${p.n}\n\n- **景點**：${p.s.join("、")}\n- **遺跡・史蹟**：${p.h.join("、")}\n- **世界遺產**：${p.wh.join("、") || "無"}\n- **祭典活動**：\n` +
      prefEvents(p).map(x => `  - ${fmtRange(x)}${x.a ? "（約）" : ""} ${x.n}：${x.x}`).join("\n")).join("\n\n") + "\n";
  }).filter(Boolean).join("\n");
  const msg = document.getElementById("jpcopymsg"), ta = document.getElementById("jpmd");
  const fallback = () => { ta.value = md; ta.hidden = false; ta.select(); msg.textContent = "無法直接複製，已選取下方文字，請按 Ctrl+C 或 ⌘C。"; };
  try {
    navigator.clipboard.writeText(md).then(() => { ta.hidden = true; msg.textContent = `已複製 ${ps.length} 個縣市的 Markdown。`; }, fallback);
  } catch (_) { fallback(); }
};

let rw = innerWidth;
addEventListener("resize", () => { if ((rw <= 620) !== (innerWidth <= 620)){ rw = innerWidth; renderCalendar(); } });
render();

// 測試與除錯用：讓瀏覽器自動化測試能讀取狀態、直接切換畫面
window.app = { st, render, selectCountry, selectPref, selectEvent, setRegion, ymd, ALL, REGIONS, REGION_OF, COUNTRIES, WH_NOTE, EVENTS, JP_AREAS, PREFS, JP_NATIONAL, PICKS, TOPO, JPTOPO };
