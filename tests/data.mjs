// 資料檢查：擴充 data/ 之後執行 npm test，填錯代碼、日期格式或重複項目都會讓檢查失敗。
import { readFileSync } from "node:fs";
import vm from "node:vm";

const files = ["regions", "countries", "events", "japan"];
const src = files.map(f => readFileSync(new URL(`../data/${f}.js`, import.meta.url), "utf8")).join("\n");
const ctx = {};
vm.runInNewContext(src + "\n;Object.assign(this, {REGIONS, REGION_OF, COUNTRIES, WH_NOTE, EVENTS, JP_AREAS, PREFS, JP_NATIONAL});", ctx);
const { REGIONS, REGION_OF, COUNTRIES, WH_NOTE, EVENTS, JP_AREAS, PREFS, JP_NATIONAL } = ctx;

const errors = [];
const fail = (where, msg) => errors.push(`${where}：${msg}`);
const isStrList = a => Array.isArray(a) && a.every(s => typeof s === "string" && s.trim());
const dupes = a => a.filter((s, i) => a.indexOf(s) !== i);

const regionKeys = new Set(REGIONS.map(r => r.k));
const isoRegion = {};
for (const [k, list] of Object.entries(REGION_OF)) {
  if (!regionKeys.has(k)) fail(`REGION_OF.${k}`, "不是已定義的區域");
  for (const iso of list.split(" ")) {
    if (isoRegion[iso]) fail(`REGION_OF.${k}`, `${iso} 同時屬於 ${isoRegion[iso]}`);
    isoRegion[iso] = k;
  }
}

for (const [code, c] of Object.entries(COUNTRIES)) {
  const w = `COUNTRIES.${code}`;
  if (!c.n || !c.f) fail(w, "缺少名稱或國旗");
  if (!regionKeys.has(c.r)) fail(w, `區域 ${c.r} 不存在`);
  if (c.iso && isoRegion[c.iso] !== c.r) fail(w, `地圖碼 ${c.iso} 在 REGION_OF 裡屬於 ${isoRegion[c.iso] || "（沒有）"}，和 r=${c.r} 不一致`);
  if (!c.iso && !(Array.isArray(c.pin) && c.pin.length === 2)) fail(w, "需要 iso 或 pin");
  for (const k of ["s", "nat"]) {
    if (k === "s" && !(c.s && c.s.length)) fail(w, "景點 s 不可為空");
    if (c[k] && !isStrList(c[k])) fail(w, `${k} 需為字串陣列`);
    if (c[k] && dupes(c[k]).length) fail(w, `${k} 有重複：${dupes(c[k]).join("、")}`);
  }
  if (!Array.isArray(c.wh)) fail(w, "wh 需為陣列（沒有世界遺產請給空陣列）");
  else for (const x of c.wh) if (!Array.isArray(x) || !x[0] || !["文", "自", "複"].includes(x[1])) fail(w, `世界遺產格式錯誤：${JSON.stringify(x)}`);
  if (c.wh && !c.wh.length && !WH_NOTE[code]) fail(w, "沒有世界遺產時請在 WH_NOTE 加說明");
}

const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const validMD = md => { const m = /^(\d\d)-(\d\d)$/.exec(md); return !!m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= DAYS[+m[1] - 1]; };
const validSpec = s => typeof s === "string" && s.split("~").length <= 2 && s.split("~").every(validMD);
function checkEvent(w, e, { needCountry = true } = {}) {
  if (needCountry && !COUNTRIES[e.c]) fail(w, `國家代碼 ${e.c} 不存在`);
  if (e.t && !["H", "F", "S"].includes(e.t)) fail(w, `類型 ${e.t} 只能是 H、F、S`);
  if (!e.n || !e.x) fail(w, "缺少名稱 n 或說明 x");
  if (!!e.d === !!e.y) fail(w, "日期 d 和 y 必須剛好填一個");
  if (e.d && !validSpec(e.d)) fail(w, `日期格式錯誤：${e.d}`);
  if (e.y) for (const [yr, s] of Object.entries(e.y)) if (!/^\d{4}$/.test(yr) || !validSpec(s)) fail(w, `年份日期格式錯誤：${yr} ${s}`);
}
EVENTS.forEach((e, i) => { if (!e.t) fail(`EVENTS[${i}] ${e.n}`, "缺少類型 t"); checkEvent(`EVENTS[${i}] ${e.n}`, e); });
const evKey = e => `${e.c}|${e.p || ""}|${e.n}|${e.d || JSON.stringify(e.y)}`;
const allEv = [...EVENTS, ...JP_NATIONAL.map(e => ({ c: "JP", ...e })), ...PREFS.flatMap(p => p.ev.map(e => ({ c: "JP", ...e, p: p.id })))];
for (const k of dupes(allEv.map(evKey))) fail("節慶", `重複項目 ${k}`);

const areaKeys = new Set(JP_AREAS.map(a => a.k));
for (const a of JP_AREAS) if (!regionKeys.has(a.c)) fail(`JP_AREAS.${a.k}`, `色票代碼 ${a.c} 不是區域代碼`);
const ids = PREFS.map(p => p.id);
const expected = Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, "0"));
if (JSON.stringify([...ids].sort()) !== JSON.stringify(expected)) fail("PREFS", "都道府縣代碼需為 01～47 且各一筆");
for (const p of PREFS) {
  const w = `PREFS.${p.id} ${p.n}`;
  if (!areaKeys.has(p.a)) fail(w, `地方 ${p.a} 不存在`);
  for (const k of ["s", "h", "wh"]) {
    if (!Array.isArray(p[k]) || (p[k].length && !isStrList(p[k]))) fail(w, `${k} 需為字串陣列`);
    else if (dupes(p[k]).length) fail(w, `${k} 有重複：${dupes(p[k]).join("、")}`);
  }
  if (!p.s.length) fail(w, "景點 s 不可為空");
  p.ev.forEach((e, i) => checkEvent(`${w} ev[${i}] ${e.n}`, e, { needCountry: false }));
}
JP_NATIONAL.forEach((e, i) => checkEvent(`JP_NATIONAL[${i}] ${e.n}`, { c: "JP", ...e }));

const total = EVENTS.length + JP_NATIONAL.length + PREFS.reduce((a, p) => a + p.ev.length, 0);
if (errors.length) {
  console.log(`資料檢查失敗，共 ${errors.length} 項：`);
  for (const e of errors) console.log("FAIL " + e);
  process.exit(1);
}
console.log(`PASS 資料檢查：${Object.keys(COUNTRIES).length} 國、${PREFS.length} 都道府縣、${total} 項節慶`);
