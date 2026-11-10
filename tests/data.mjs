// 資料檢查：先依 data/schema/ 驗證每個 JSON 的結構，再檢查檔案之間的對應關係。
import { readFileSync } from "node:fs";
import { validate } from "./schema.mjs";

const read = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const errors = [];
const fail = (where, msg) => errors.push(`${where}：${msg}`);

// 1. 結構
const files = { regions: "regions.json", countries: "countries.json", events: "events.json", japan: "japan.json", picks: "picks.json" };
const data = {};
for (const [k, f] of Object.entries(files)) {
  data[k] = read(f);
  const schema = data[k].$schema?.replace("./schema/", "");
  if (!schema) { fail(f, "缺少 $schema"); continue; }
  for (const e of validate(schema, data[k])) fail(f, e);
}
if (errors.length) report("結構錯誤修正後，會再進行代碼對應、日期與重複項目的檢查。");

// 2. 交叉檢查
const { regions, regionOf } = data.regions;
const { countries, whNote } = data.countries;
const { events } = data.events;
const { areas, prefectures, national } = data.japan;

const regionKeys = new Set(regions.map(r => r.k));
const isoRegion = {};
for (const [k, list] of Object.entries(regionOf)) {
  if (!regionKeys.has(k)) fail(`regions.json regionOf.${k}`, "不是已定義的區域");
  for (const iso of list.split(" ")) {
    if (isoRegion[iso]) fail(`regions.json regionOf.${k}`, `${iso} 同時屬於 ${isoRegion[iso]}`);
    isoRegion[iso] = k;
  }
}
for (const [code, c] of Object.entries(countries)) {
  const w = `countries.json ${code} ${c.n}`;
  if (!regionKeys.has(c.r)) fail(w, `區域 ${c.r} 不存在`);
  if (c.iso && isoRegion[c.iso] !== c.r) fail(w, `地圖碼 ${c.iso} 在 regionOf 屬於 ${isoRegion[c.iso] || "（沒有）"}，和 r=${c.r} 不一致`);
  if (!c.wh.length && !whNote[code]) fail(w, "沒有世界遺產時請在 whNote 加說明");
}
for (const code of Object.keys(whNote)) if (!countries[code]) fail("countries.json whNote", `國家代碼 ${code} 不存在`);

const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const validDates = s => s.split("~").every(md => { const [m, d] = md.split("-").map(Number); return m >= 1 && m <= 12 && d >= 1 && d <= DAYS[m - 1]; });
function checkDates(w, e) {
  if (e.d && !validDates(e.d)) fail(w, `不存在的日期 ${e.d}`);
  for (const [yr, s] of Object.entries(e.y || {})) if (!validDates(s)) fail(w, `不存在的日期 ${yr} ${s}`);
}
events.forEach((e, i) => {
  const w = `events.json [${i}] ${e.n}`;
  if (!countries[e.c]) fail(w, `國家代碼 ${e.c} 不存在`);
  checkDates(w, e);
});
const areaKeys = new Set(areas.map(a => a.k));
for (const a of areas) if (!regionKeys.has(a.c)) fail(`japan.json areas.${a.k}`, `色票代碼 ${a.c} 不是區域代碼`);
const ids = prefectures.map(p => p.id);
for (const id of ids.filter((x, i) => ids.indexOf(x) !== i)) fail("japan.json prefectures", `都道府縣代碼 ${id} 重複`);
for (const p of prefectures) {
  const w = `japan.json ${p.id} ${p.n}`;
  if (!areaKeys.has(p.a)) fail(w, `地方 ${p.a} 不存在`);
  p.ev.forEach((e, i) => { if (e.c && e.c !== "JP") fail(`${w} ev[${i}]`, "日本各縣祭典的 c 只能是 JP 或省略"); checkDates(`${w} ev[${i}] ${e.n}`, e); });
}
national.forEach((e, i) => { if (e.c && e.c !== "JP") fail(`japan.json national[${i}]`, "c 只能是 JP 或省略"); checkDates(`japan.json national[${i}] ${e.n}`, e); });

const allEv = [...events, ...national.map(e => ({ c: "JP", ...e })), ...prefectures.flatMap(p => p.ev.map(e => ({ c: "JP", ...e, p: p.id })))];
const keys = allEv.map(e => `${e.c}|${e.p || ""}|${e.n}|${e.d || JSON.stringify(e.y)}`);
for (const k of keys.filter((x, i) => keys.indexOf(x) !== i)) fail("節慶", `重複項目 ${k}`);

// 每月推薦：國家代碼、日本縣市代碼、重複名稱；REQUIRED_MONTHS 內的月份必須涵蓋全部國家
const REQUIRED_MONTHS = ["1", "2", "11", "12"];
const prefIds = new Set(ids);
for (const [month, byCountry] of Object.entries(data.picks.picks)) {
  for (const [code, items] of Object.entries(byCountry)) {
    const w = `picks.json ${month} 月 ${code}`;
    if (!countries[code]) { fail(w, `國家代碼 ${code} 不存在`); continue; }
    const names = items.map(i => i.n);
    for (const n of names.filter((x, i) => names.indexOf(x) !== i)) fail(w, `重複項目 ${n}`);
    for (const it of items) if (it.p && (code !== "JP" || !prefIds.has(it.p))) fail(`${w} ${it.n}`, `p=${it.p} 只能用在日本，且需為 01～47`);
  }
  if (REQUIRED_MONTHS.includes(month)) {
    const missing = Object.keys(countries).filter(c => !byCountry[c]);
    if (missing.length) fail(`picks.json ${month} 月`, `缺少 ${missing.length} 國：${missing.join("、")}`);
  }
}
for (const m of REQUIRED_MONTHS) if (!data.picks.picks[m]) fail("picks.json", `缺少 ${m} 月`);

report();
function report(note) {
  if (errors.length) {
    console.log(`資料檢查失敗，共 ${errors.length} 項：`);
    for (const e of errors) console.log("FAIL " + e);
    if (note) console.log(note);
    process.exit(1);
  }
  console.log(`PASS 資料檢查：${Object.keys(countries).length} 國、${prefectures.length} 都道府縣、${allEv.length} 項節慶`);
}
