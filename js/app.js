import { chipRow, tabBar, tagList, listOf, pickList, entityHead, placeTip, onClicks } from "./components.js";
import { loadData } from "./data.js";
import { t, LANG } from "./i18n.js";

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
const TB = t("tabs");
const TABS = [["ev", TB.ev, (c, e) => e.length], ["s", TB.s, c => c.s.length], ["nat", TB.nat, c => (c.nat || []).length], ["wh", TB.wh, c => (c.wh || []).length], ["ex", TB.ex, c => (c.ex || []).length]];
const WK = {"文":"cul","自":"nat","複":"mix"}, WN = t("whKind");
const TYPE_N = t("types");
const RN = Object.fromEntries(REGIONS.map(r => [r.k, r.n]));
const ISO_REGION = {};
for (const [k, s] of Object.entries(REGION_OF)) for (const id of s.split(" ")) ISO_REGION[id] = k;
const ISO_CODE = {};
for (const [code, c] of Object.entries(COUNTRIES)) if (c.iso) ISO_CODE[c.iso] = code;

// 把使用者輸入的文字放進 HTML 前先跳脫
const esc = s => String(s).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

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
  region: null, country: null, ev: null, day: null, q: "", groupOpen: {}, more: new Set(), open: new Set(), tab: "pk", pref: null, ptab: "s", area: null,
  types: {H:true, F:true, G:true, S:true}
};
// 只讀回 H、F、S 三個布林值，其他內容一律忽略
try { const saved = JSON.parse(localStorage.getItem("fest-types")); for (const k of Object.keys(st.types)) if (typeof saved?.[k] === "boolean") st.types[k] = saved[k]; } catch(_) {}
// 網址參數：?m=1～12 開在該月（今年已過就開明年），?c=國家代碼 開在該國；國家頁與月份頁的連結會帶這兩個參數
const qs = new URLSearchParams(location.search);
const qm = Number(qs.get("m")), qc = (qs.get("c") || "").toUpperCase();
if (qm >= 1 && qm <= 12){
  st.m = qm - 1;
  if (st.y === now.getFullYear() && st.m < now.getMonth() && YEARS.includes(st.y + 1)) st.y++;
}

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
    html = `${c.f} <b>${c.n}</b>　${RN[c.r]}<br><span style="color:var(--muted)">${t("mapTipCountry", st.m+1, n, wh)}</span>`;
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
  el.innerHTML = chipRow("r", st.region, t("allRegions"), REGIONS.map(r => ({v: r.k, label: r.n, dot: r.k, n: counts[r.k] || 0, title: t("regionTitle", r.n, counts[r.k] || 0)})));
  onClicks(el, "button", b => setRegion(b.dataset.r || null));
  // 第二層：選定區域後列出該區國家
  const cr = document.getElementById("crow");
  cr.hidden = !st.region;
  if (!st.region){ cr.innerHTML = ""; return; }
  const list = Object.entries(COUNTRIES).filter(([, c]) => c.r === st.region);
  cr.innerHTML = `<span class="lab"><i class="dot" style="width:9px;height:9px;border-radius:50%;background:var(--r-${st.region})"></i>${t("regionCountries", RN[st.region])}<small>${t("countsHint", st.m+1)}</small></span>` +
    chipRow("c", st.country, t("allCountries"), list.map(([code, c]) => { const n = monthCount(x => x.c === code); return {v: code, label: `${c.f} ${c.n}`, n, title: t("countryTitle", c.n, st.m+1, n)}; }));
  onClicks(cr, "button", b => {
    if (!b.dataset.c){ st.country = null; st.ev = null; render(); return; }
    selectCountry(b.dataset.c);
  });
}

// ---------- 控制列 ----------
const yearSel = document.getElementById("year");
yearSel.innerHTML = YEARS.map(y => `<option value="${y}">${t("year", y)}</option>`).join("");
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
function selectDay(key){
  st.day = st.day === key ? null : key;
  renderCalendar(); renderSide();
  if (st.day && innerWidth <= 900) document.getElementById("side").scrollIntoView({behavior: reduce ? "auto" : "smooth", block:"start"});
}
// 點清單項目：在原地展開或收合介紹，並在月曆上標出期間；不改變國家、區域、月份等篩選
function selectEvent(id){
  if (st.open.has(id)){ st.open.delete(id); if (st.ev === id) st.ev = null; }
  else { st.open.add(id); st.ev = id; }
  renderCalendar(); renderSide(); renderJP();
}
// 點月曆格子裡的活動：在右側列出那一天的活動，並展開這一項的介紹
function showEventOnDay(id, key){
  st.open.add(id); st.ev = id; st.day = key;
  renderCalendar(); renderSide();
  if (innerWidth <= 900) document.getElementById("side").scrollIntoView({behavior: reduce ? "auto" : "smooth", block:"start"});
}

// ---------- 月曆 ----------
function renderCalendar(){
  document.getElementById("mtitle").textContent = t("yearMonth", st.y, st.m+1);
  yearSel.value = st.y;
  document.getElementById("prev").disabled = st.y === YEARS[0] && st.m === 0;
  document.getElementById("next").disabled = st.y === YEARS.at(-1) && st.m === 11;
  document.getElementById("months").innerHTML = Array.from({length:12}, (_, i) =>
    `<button data-m="${i}" aria-current="${i === st.m}" aria-label="${t("month", i+1)}">${LANG === "en" ? t("monthShort", i+1) : i+1}</button>`).join("");
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
      return `<button class="ev ${x.t}${x.s < first ? " cont" : ""}" data-id="${x.id}" title="${c.n}${x.p ? t("sep") + PREF_BY_ID[x.p].n : ""}${t("sep")}${x.n} (${fmtRange(x)})">${c.f} ${x.n}</button>`;
    }).join("");
    const more = starts.length > maxChips ? `<button class="more" data-day="${key}" aria-expanded="${open}">${open ? t("collapse") : t("moreN", starts.length - maxChips)}</button>` : "";
    const picked = st.day === key;
    html += `<div class="cell${key === today ? " today" : ""}${span ? " span" : ""}${picked ? " picked" : ""}" data-day="${key}">
      <div class="dn"><button class="dbtn" data-day="${key}" aria-pressed="${picked}" aria-label="${t("dayAria", st.m+1, day.getDate())}"><b>${day.getDate()}</b></button>${ongoing ? `<span class="ongo">${t("ongoingN", ongoing)}</span>` : ""}</div>${chips}${more}</div>`;
  }
  const grid = document.getElementById("grid");
  grid.innerHTML = html;
  grid.querySelectorAll(".ev").forEach(b => b.onclick = () => showEventOnDay(b.dataset.id, b.closest(".cell").dataset.day));
  // 點日期數字或格子空白處：在右側列出當天的活動；格子裡的活動按鈕維持原本的行為
  grid.onclick = e => {
    if (e.target.closest(".ev, .more")) return;
    const cell = e.target.closest(".cell[data-day]");
    if (cell) selectDay(cell.dataset.day);
  };
  onClicks(grid, ".more", b => { st.openDay = st.openDay === b.dataset.day ? null : b.dataset.day; renderCalendar(); });
}

// ---------- 側欄 ----------
function itemHTML(x, showCountry, hidePref){
  const c = COUNTRIES[x.c];
  const approx = x.a ? `<i>${t("approx")}</i>` : "";
  const sel = st.open.has(x.id) ? " on" : "";
  return `<li><button class="item${sel}" data-id="${x.id}" data-day-start="${ymd(x.s)}" aria-expanded="${!!sel}" title="${sel ? t("hideIntro") : t("showIntro")}">
    <span class="dt">${fmtRange(x)}${approx}</span>
    <span><span class="nm">${showCountry ? c.f + " " : ""}${x.n}<span class="tag ${x.t}">${TYPE_N[x.t]}</span></span>
    ${showCountry ? `<span class="meta rg"><i style="background:var(--r-${x.r})"></i>${c.n}${x.p ? t("sep") + PREF_BY_ID[x.p].n : ""}${t("sep")}${RN[x.r]}</span>` : x.p && !hidePref ? `<span class="meta">${PREF_BY_ID[x.p].n}</span>` : ""}
    ${sel ? `<span class="ds">${x.x}</span>` : ""}</span></button></li>`;
}
// 可收合的分組：標題顯示項目數，每組先列 LIMIT 項，按「顯示全部」再展開。
// 使用者展開或收合過的分組記在 st.groupOpen，重畫側欄時維持；含有選取中活動的分組一律展開
const LIMIT = 6;
function group(key, label, xs, { open = true, showCountry = true, hidePref = false } = {}){
  if (!xs.length) return "";
  // 有點開介紹的項目就展開這組；只有點開的項目落在前 LIMIT 項之外時才列出全部
  const hasSel = xs.some(x => st.open.has(x.id));
  const isOpen = hasSel || (st.groupOpen[key] ?? open);
  const shown = st.more.has(key) || xs.slice(LIMIT).some(x => st.open.has(x.id)) ? xs : xs.slice(0, LIMIT);
  return `<details class="grp-d" data-g="${key}"${isOpen ? " open" : ""}><summary><span class="gl">${label}</span><small>${t("nItems", xs.length)}</small></summary>
    ${eventList(shown, "", showCountry, hidePref)}
    ${xs.length > shown.length ? `<button class="more-g" data-g="${key}">${t("showAll", xs.length)}</button>` : ""}</details>`;
}
const dotLabel = (r, text) => `<i class="sw" style="background:var(--r-${r});border-radius:50%"></i>${text}`;

// 選取日期時的當天活動面板；showCountry 為 false 時（已選國家）只列該國、版面較精簡
function dayPanel(showCountry){
  const [y, m, d] = st.day.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const evs = ALL.filter(x => matches(x) && x.s <= day && x.e >= day).sort((a, b) => a.s - b.s || a.e - b.e);
  const fest = evs.filter(x => x.t !== "S"), seas = evs.filter(x => x.t === "S");
  const starts = fest.filter(x => +x.s === +day), ongoing = fest.filter(x => +x.s !== +day);
  const where = st.country ? COUNTRIES[st.country].n : st.region ? RN[st.region] : "";
  const title = `${t("dayTitle", m, d, day.getDay())}${where ? `${t("sep")}${where}` : ""}`;
  return `<div class="panel day-panel"><h3>${title}<small>${t("nItems", fest.length)}</small></h3>
    <button class="x day-clear" id="clearDay">${showCountry ? t("wholeMonth") : t("clearDay")}</button>
    ${fest.length ? "" : `<p class="empty">${t("emptyDay", st.types.S && seas.length)}</p>`}
    ${group("day:start", t("startsToday"), starts, { showCountry })}
    ${group("day:on", t("ongoing"), ongoing, { showCountry, open: !starts.length })}
    ${st.types.S ? group("day:season", t("goodToVisit"), seas, { showCountry, open: !fest.length }) : ""}</div>`;
}
let lastSideView = "";
function renderSide(){
  const side = document.getElementById("side");
  let html = "";
  if (st.day) html += dayPanel(!st.country);
  if (st.country){
    const c = COUNTRIES[st.country];
    const yearEvs = ALL.filter(x => x.c === st.country && (x.s.getFullYear() === st.y) && st.types[x.t]).sort((a,b) => a.s - b.s);
    // 有當月推薦時多一個分頁並預設打開；沒有時退回景點分頁
    const picks = monthPicks(st.country);
    // 「全年體驗」還沒整理的國家不顯示該分頁
    const base = TABS.filter(([k]) => k !== "ex" || c.ex?.length);
    const tabs = picks.length ? [["pk", t("monthPicks", st.m + 1), () => picks.length], ...base] : base;
    const tab = (st.tab === "pk" && !picks.length) || (st.tab === "ex" && !c.ex?.length) ? "s" : st.tab;
    html += `<div class="panel">
      ${entityHead({flag: c.f, name: c.n, color: c.r, sub: RN[c.r], btnId: "clearC", btnLabel: t("allCountriesBtn")})}
      ${c.warn ? `<p class="warn">${c.warn}</p>` : ""}
      ${st.country === "JP" ? `<button class="jp-link" id="toJP">${t("toJP")}</button>` : ""}
      ${tabBar("tab", tab, tabs, c, yearEvs)}
      ${tab === "pk" ? `<p class="pk-legend">${t("picksLegend", st.m + 1)}</p>${pickList(picks, sourceName, it => it.p ? `<p class="meta">${PREF_BY_ID[it.p].n}</p>` : "")}` : ""}
      ${tab === "ev" ? (yearEvs.length ? Array.from({length: 12}, (_, i) => group(`cev:${i}`, t("month", i + 1), yearEvs.filter(x => x.s.getMonth() === i), { showCountry: false, open: i === st.m })).join("") : `<p class="empty">${t("emptyYear")}</p>`) : ""}
      ${tab === "s" ? tagList(c.s) : ""}
      ${tab === "nat" ? tagList(c.nat || [], "nat") : ""}
      ${tab === "ex" ? `${tagList(c.ex, "ex")}<p class="wh-legend">${t("exLegend")}</p>` : ""}
      ${tab === "wh" ? (c.wh && c.wh.length ? `${tagList(c.wh, "wh", ([n, k]) => `<span class="wk ${WK[k]}">${WN[k]}</span>${n}`)}<p class="wh-legend">${t("whLegend")}</p>` : `<p class="empty">${WH_NOTE[st.country] || t("noWh")}</p>`) : ""}
    </div>`;
  } else if (!st.day){
    const evs = monthEvents(false);
    const fest = evs.filter(x => x.t !== "S"), seas = evs.filter(x => x.t === "S");
    const byRegion = REGIONS.map(r => ({r, xs: fest.filter(x => x.r === r.k)})).filter(g => g.xs.length);
    html += `<div class="panel"><h3>${t("monthEvents", st.m+1)}<small>${t("nItems", fest.length)}</small></h3>
      ${byRegion.map(g => group(`mon:${g.r.k}`, dotLabel(g.r.k, g.r.n), g.xs)).join("")
        || `<p class="empty">${t("emptyMonth")}</p>`}</div>`;
    if (st.types.S) html += `<div class="panel"><h3>${t("monthSeason", st.m+1)}<small>${t("nItems", seas.length)}</small></h3>
      ${seas.length ? group("mon:season", t("allRegions"), seas, { open: false }) : `<p class="empty">${t("emptySeason")}</p>`}</div>`;
  }
  // 換了顯示內容（月份、日期、國家、分頁）時，回到清單頂端並收起「顯示全部」
  const view = `${st.y}-${st.m}|${st.day}|${st.country}|${st.tab}`;
  if (view !== lastSideView){ st.more.clear(); }
  side.innerHTML = html;
  showSelectedTab(side);
  if (view !== lastSideView){ side.scrollTop = 0; lastSideView = view; }
  // 只記住使用者自己點開或收合的分組（瀏覽器在預設展開時也會觸發 toggle，所以改聽點擊）
  // 點擊事件先於展開動作，所以點下時的相反狀態就是新狀態；立即記下，避免緊接著重畫時用到舊狀態
  side.querySelectorAll("details.grp-d > summary").forEach(sm => sm.addEventListener("click", () => {
    const d = sm.parentElement; st.groupOpen[d.dataset.g] = !d.open;
  }));
  onClicks(side, ".more-g", b => { st.more.add(b.dataset.g); renderSide(); });
  const on = st.ev && side.querySelector(`.item.on[data-id="${st.ev}"]`);
  if (on && side.scrollHeight > side.clientHeight) on.scrollIntoView({block: "nearest"});
  onClicks(side, ".item", b => selectEvent(b.dataset.id));
  onClicks(side, "[data-tab]", b => { st.tab = b.dataset.tab; renderSide(); });
  const tj = document.getElementById("toJP");
  if (tj) tj.onclick = () => document.getElementById("jp").scrollIntoView({behavior: reduce ? "auto" : "smooth", block:"start"});
  const cd = document.getElementById("clearDay");
  if (cd) cd.onclick = () => selectDay(st.day);
  const cc = document.getElementById("clearC");
  if (cc) cc.onclick = () => selectCountry(st.country);
}

function renderActive(){
  const el = document.getElementById("af");
  const pills = [];
  if (st.region) pills.push(`<span class="pill">${t("pillRegion", RN[st.region])}<button data-k="region" aria-label="${t("clearRegion")}">✕</button></span>`);
  if (st.country) pills.push(`<span class="pill">${t("pillCountry", `${COUNTRIES[st.country].f} ${COUNTRIES[st.country].n}`)}<button data-k="country" aria-label="${t("clearCountry")}">✕</button></span>`);
  if (st.q) pills.push(`<span class="pill">${t("pillSearch", esc(st.q))}<button data-k="q" aria-label="${t("clearSearch")}">✕</button></span>`);
  el.innerHTML = pills.join("");
  el.querySelectorAll("button").forEach(b => b.onclick = () => {
    if (b.dataset.k === "region"){ st.region = null; zoomToRegion(null); }
    if (b.dataset.k === "country"){ st.country = null; st.ev = null; }
    if (b.dataset.k === "q"){ st.q = ""; document.getElementById("q").value = ""; }
    render();
  });
}

function render(){
  // 選取的日期不在目前顯示的月份時就取消，例如換月、換年
  if (st.day && !st.day.startsWith(`${st.y}-${pad(st.m+1)}-`)) st.day = null;
  document.querySelectorAll(".tbtn").forEach(b => b.setAttribute("aria-pressed", st.types[b.dataset.t]));
  renderRegions(); renderActive(); renderCalendar(); renderSide(); paintMap(); renderJP(); renderJPList();
}
{
  const nc = Object.keys(COUNTRIES).length;
  const nwh = Object.values(COUNTRIES).reduce((a, c) => a + (c.wh ? c.wh.length : 0), 0);
  document.getElementById("sub").textContent = t("subtitle", nc, nwh);
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
jg.append("text").attr("x", 16).attr("y", 20).text(t("okinawa"));
const jpaths = jg.append("g").selectAll("path").data(jfc.features).join("path")
  .attr("d", jpath)
  .attr("transform", f => f.id === "47" ? okiT : null)
  .attr("vector-effect", "non-scaling-stroke")
  .attr("fill", f => `var(--r-${AREA_BY[PREF_BY_ID[f.id].a].c})`);
const jtip = document.getElementById("jptip");
jpaths.on("mousemove", (ev, f) => {
  const p = PREF_BY_ID[f.id];
  const n = monthCount(x => x.p === f.id);
  placeTip(jtip, document.querySelector(".jp-map-card"), ev, `<b>${p.n}</b>　${t("area", AREA_BY[p.a].n)}<br><span style="color:var(--muted)">${t("prefTip", st.m+1, n, p.wh.length)}</span>`);
}).on("mouseleave", () => jtip.hidden = true)
  .on("click", (ev, f) => selectPref(f.id));

function selectPref(id){
  st.pref = st.pref === id ? null : id;
  renderJP();
  if (st.pref && innerWidth <= 900) document.getElementById("pref").scrollIntoView({behavior: reduce ? "auto" : "smooth", block:"start"});
}
// 分頁列放不下時會橫向捲動，把選中的分頁捲進可見範圍
function showSelectedTab(root){
  const bar = root.querySelector(".tabs"), b = bar?.querySelector('[aria-selected="true"]');
  if (!b) return;
  const l = b.offsetLeft - bar.offsetLeft, r = l + b.offsetWidth;
  if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth + 8;
  else if (l < bar.scrollLeft) bar.scrollLeft = l;
}
const PT = t("ptabs");
const PTABS = [["s", PT.s, p => p.s.length], ["h", PT.h, p => p.h.length], ["wh", PT.wh, p => p.wh.length], ["ev", PT.ev, (p, e) => e.length], ["ex", PT.ex, p => (p.ex || []).length]];
function renderJP(){
  // 日本 47 都道府縣只在選到日本時顯示
  const jpOn = st.country === "JP";
  document.getElementById("jp").hidden = !jpOn;
  if (!jpOn) return;
  const areasEl = document.getElementById("areas");
  areasEl.innerHTML = chipRow("a", st.area, t("allAreas"), JP_AREAS.map(a => { const n = PREFS.filter(p => p.a === a.k).length; return {v: a.k, label: a.n, dot: a.c, n, title: t("areaTitle", a.n, n)}; }));
  onClicks(areasEl, "button", b => { st.area = b.dataset.a && st.area !== b.dataset.a ? b.dataset.a : null; renderJP(); renderJPList(); });
  const active = new Set(ALL.filter(x => x.p && inMonth(x) && st.types[x.t]).map(x => x.p));
  jpaths.attr("fill-opacity", f => st.area && PREF_BY_ID[f.id].a !== st.area ? .15 : active.has(f.id) ? 1 : .45)
    .classed("sel", f => f.id === st.pref);
  jpaths.filter(".sel").raise();

  const el = document.getElementById("pref");
  if (!st.pref){
    const areas = JP_AREAS.filter(a => !st.area || a.k === st.area);
    el.innerHTML = `<h3>${t("choosePref")}<small>${t("choosePrefHint", st.m+1)}</small></h3>
      <div class="pref-index">${areas.map(a => `<div class="row"><span class="lab"><i class="sw" style="background:var(--r-${a.c});border-radius:50%"></i>${a.n}</span>
        ${PREFS.filter(p => p.a === a.k).map(p => `<button class="pbtn" data-p="${p.id}">${p.n}${active.has(p.id) ? `<small>●</small>` : ""}</button>`).join("")}</div>`).join("")}</div>`;
    el.querySelectorAll(".pbtn").forEach(b => b.onclick = () => selectPref(b.dataset.p));
    return;
  }
  const p = PREF_BY_ID[st.pref], ar = AREA_BY[p.a];
  const evs = ALL.filter(x => x.p === p.id && x.s.getFullYear() === st.y && st.types[x.t]).sort((a, b) => a.s - b.s);
  const list = (arr, cls) => arr.length ? tagList(arr, cls) : `<p class="empty">${t("prefNoWh")}</p>`;
  el.innerHTML = `${entityHead({name: p.n, color: ar.c, sub: t("area", ar.n), btnId: "clearP", btnLabel: t("allPrefs")})}
    ${tabBar("ptab", st.ptab === "ex" && !p.ex?.length ? "s" : st.ptab, PTABS.filter(([k]) => k !== "ex" || p.ex?.length), p, evs)}
    ${st.ptab === "s" || (st.ptab === "ex" && !p.ex?.length) ? list(p.s, "") : ""}
    ${st.ptab === "ex" && p.ex?.length ? `${tagList(p.ex, "ex")}<p class="wh-legend">${t("exLegend")}</p>` : ""}
    ${st.ptab === "h" ? list(p.h, "hist") : ""}
    ${st.ptab === "wh" ? list(p.wh, "wh") : ""}
    ${st.ptab === "ev" ? eventList(evs, t("prefEmptyYear", st.y), false, true) : ""}`;
  showSelectedTab(el);
  onClicks(el, "[data-ptab]", b => { st.ptab = b.dataset.ptab; renderJP(); });
  el.querySelector("#clearP").onclick = () => selectPref(st.pref);
  el.querySelectorAll(".item").forEach(b => b.onclick = () => selectEvent(b.dataset.id));
}

// ---------- 日本縣市一覽 ----------
st.jpView = "map"; st.jpq = "";
const prefEvents = p => ALL.filter(x => x.p === p.id && x.s.getFullYear() === st.y).sort((a, b) => a.s - b.s);
const prefText = p => [p.n, ...p.s, ...p.h, ...p.wh, ...(p.ex || []), ...prefEvents(p).map(x => x.n + x.x)].join(" ");
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
  const evTxt = x => `${hl(x.n)} <span class="d">${fmtRange(x)}${x.a ? t("approxParen") : ""}</span>`;
  el.innerHTML = JP_AREAS.map(a => {
    const g = ps.filter(p => p.a === a.k);
    if (!g.length) return "";
    return `<section><h3 class="al"><i class="sw" style="background:var(--r-${a.c});border-radius:50%"></i>${t("area", a.n)}<small>${g.length}</small></h3>
      <div class="pcards">${g.map(p => {
        const evs = prefEvents(p);
        return `<article class="pc"><h4><button data-p="${p.id}" title="${t("onMap")}">${p.n}</button><small>${t("prefCounts", p.wh.length, evs.length)}</small></h4>
          <dl><dt>${PT.s}</dt><dd>${p.s.map(hl).join(t("list"))}</dd>
          <dt>${PT.h}</dt><dd>${p.h.map(hl).join(t("list"))}</dd>
          <dt>${PT.wh}</dt><dd>${p.wh.length ? p.wh.map(hl).join(t("list")) : "—"}</dd>
          ${p.ex?.length ? `<dt>${PT.ex}</dt><dd>${p.ex.map(hl).join(t("list"))}</dd>` : ""}
          <dt>${PT.ev}</dt><dd>${evs.map(evTxt).join(t("list")) || "—"}</dd></dl></article>`;
      }).join("")}</div></section>`;
  }).join("") || `<p class="empty">${t("noPrefMatch", esc(st.jpq))}</p>`;
  el.querySelectorAll("[data-p]").forEach(b => b.onclick = () => {
    st.pref = b.dataset.p; st.jpView = "map";
    renderJP(); renderJPList();
    document.getElementById("jp").scrollIntoView({behavior: reduce ? "auto" : "smooth", block:"start"});
  });
}
document.getElementById("jpcopy").onclick = () => {
  const ps = visiblePrefs();
  const md = `# ${t("mdTitle", st.y)}\n\n` + JP_AREAS.map(a => {
    const g = ps.filter(p => p.a === a.k);
    if (!g.length) return "";
    const L = t("list"), C = t("colon");
    return `## ${t("area", a.n)}\n\n` + g.map(p => `### ${p.n}\n\n- **${PT.s}**${C}${p.s.join(L)}\n- **${PT.h}**${C}${p.h.join(L)}\n- **${PT.wh}**${C}${p.wh.join(L) || t("none")}\n${p.ex?.length ? `- **${PT.ex}**${C}${p.ex.join(L)}\n` : ""}- **${PT.ev}**${C}\n` +
      prefEvents(p).map(x => `  - ${fmtRange(x)}${x.a ? t("approxParen") : ""} ${x.n}${C}${x.x}`).join("\n")).join("\n\n") + "\n";
  }).filter(Boolean).join("\n");
  const msg = document.getElementById("jpcopymsg"), ta = document.getElementById("jpmd");
  const fallback = () => { ta.value = md; ta.hidden = false; ta.select(); msg.textContent = t("copyFail"); };
  try {
    navigator.clipboard.writeText(md).then(() => { ta.hidden = true; msg.textContent = t("copied", ps.length); }, fallback);
  } catch (_) { fallback(); }
};

let rw = innerWidth;
addEventListener("resize", () => { if ((rw <= 620) !== (innerWidth <= 620)){ rw = innerWidth; renderCalendar(); } });
render();
if (COUNTRIES[qc]) selectCountry(qc);

// 測試與除錯用：讓瀏覽器自動化測試能讀取狀態、直接切換畫面
window.app = { st, render, selectCountry, selectPref, selectEvent, selectDay, setRegion, ymd, ALL, REGIONS, REGION_OF, COUNTRIES, WH_NOTE, EVENTS, JP_AREAS, PREFS, JP_NATIONAL, PICKS, TOPO, JPTOPO };
