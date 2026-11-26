import { t, LANG } from "./i18n.js";
// 讀取 data/ 底下的 JSON 資料。所有資料都從這裡進入程式。
// 英文版頁面放在 en/ 底下，<html data-base="../"> 讓資料路徑指回網站根目錄
const BASE = document.documentElement.dataset.base || "";
const FILES = {
  regions: "data/regions.json",
  countries: "data/countries.json",
  events: "data/events.json",
  japan: "data/japan.json",
  picks: "data/picks.json",
  worldMap: "data/map-world.json",
  japanMap: "data/map-japan.json",
  ...(LANG === "en" ? { en: "data/i18n/en.json" } : {}),
};

// 英文版：把資料裡的中文名稱與說明換成 data/i18n/en.json 的英文（每月推薦維持中文）
function applyEnglish(d) {
  const EN = d.en, tr = s => (s && EN[s]) || s;
  const trList = xs => xs && xs.map(tr);
  d.regions.regions.forEach(r => { r.n = tr(r.n); });
  for (const c of Object.values(d.countries.countries)) {
    c.n = tr(c.n); c.s = trList(c.s); c.nat = trList(c.nat); c.ex = trList(c.ex); c.warn = tr(c.warn);
    if (c.wh) c.wh = c.wh.map(([n, k]) => [tr(n), k]);
  }
  for (const k of Object.keys(d.countries.whNote)) d.countries.whNote[k] = tr(d.countries.whNote[k]);
  d.events.events.forEach(e => { e.n = tr(e.n); e.x = tr(e.x); });
  d.japan.areas.forEach(a => { a.n = tr(a.n); });
  d.japan.national.forEach(e => { e.n = tr(e.n); e.x = tr(e.x); });
  d.japan.prefectures.forEach(p => {
    p.n = tr(p.n); p.s = trList(p.s); p.h = trList(p.h); p.wh = trList(p.wh); p.ex = trList(p.ex);
    p.ev.forEach(e => { e.n = tr(e.n); e.x = tr(e.x); });
  });
  for (const k of Object.keys(d.picks.sourceNames)) d.picks.sourceNames[k] = tr(d.picks.sourceNames[k]);
}

async function fetchJSON(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path} 讀取失敗（HTTP ${res.status}）`);
  return res.json();
}

function showLoadError(err) {
  const box = document.createElement("div");
  box.className = "load-error";
  box.setAttribute("role", "alert");
  const b = document.createElement("b");
  b.textContent = t("loadFail");
  box.append(b, err.message);
  document.querySelector(".wrap").prepend(box);
}

export async function loadData() {
  try {
    const entries = await Promise.all(Object.entries(FILES).map(async ([k, p]) => [k, await fetchJSON(p)]));
    const d = Object.fromEntries(entries);
    if (d.en) applyEnglish(d);
    return {
      REGIONS: d.regions.regions,
      REGION_OF: d.regions.regionOf,
      COUNTRIES: d.countries.countries,
      WH_NOTE: d.countries.whNote,
      EVENTS: d.events.events,
      JP_AREAS: d.japan.areas,
      PREFS: d.japan.prefectures,
      JP_NATIONAL: d.japan.national,
      PICKS: d.picks.picks,
      SOURCE_NAMES: d.picks.sourceNames,
      TOPO: d.worldMap,
      JPTOPO: d.japanMap,
    };
  } catch (err) {
    showLoadError(err);
    throw err;
  }
}
