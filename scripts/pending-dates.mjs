// 列出日期還沒確定的活動，產生 docs/pending-dates.md
// 用法：node scripts/pending-dates.mjs [YYYY-MM-DD]   （預設今天；只列今天以後還會發生的）
// 兩種情況會列出：
//   1. 標 "a":1 的推估日期（農曆、伊斯蘭曆、主辦單位尚未公布等）
//   2. 每年都辦、但缺少明年日期的活動（只有今年的 y）
//   3. data/future.json 裡不是每年舉辦的活動（奧運、亞運、世界盃、隔年祭典等）的下一屆
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = f => JSON.parse(readFileSync(join(root, "data", f), "utf8"));
const today = process.argv[2] ? new Date(process.argv[2]) : new Date();
const YEARS = JSON.parse(readFileSync(join(root, "js", "app.js"), "utf8").match(/const YEARS = (\[[^\]]*\])/)[1]);
// 不會每年舉辦（或明年不在這個城市辦），缺明年日期不算待查；它們的下一屆記在 data/future.json
const ONE_OFF = /奧運|帕運|亞運|亞帕運|世界盃|大英國協|泛美|田徑錦標賽|選舉|教宗|最後一屆|國民休日|花毯節|巴塞隆納）|山王祭|雙年展/;
const TN = { H: "國定假日", F: "祭典活動", G: "體育賽事", S: "旅遊季節" };

const { countries } = read("countries.json");
const { events } = read("events.json");
const japan = read("japan.json");
const all = [...events.map(e => ({ ...e, where: countries[e.c].n }))];
for (const e of japan.national) all.push({ c: "JP", ...e, where: "日本" });
for (const p of japan.prefectures) for (const e of p.ev) all.push({ c: "JP", t: "F", ...e, where: `日本・${p.n}` });

const start = (y, spec) => { const [a] = spec.split("~"); const [m, d] = a.split("-").map(Number); return new Date(y, m - 1, d); };
const rows = [];
for (const e of all) {
  const occ = YEARS.map(y => ({ y, spec: e.d || e.y?.[y] })).filter(o => o.spec);
  const upcoming = occ.filter(o => start(o.y, o.spec) >= new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  if (e.a && upcoming.length) for (const o of upcoming) rows.push({ e, y: o.y, spec: o.spec, why: e.d ? "每年慣例日期，當年日期未確認" : "推估日期" });
  if (e.y) {
    const last = Math.max(...Object.keys(e.y).map(Number));
    if (last < YEARS.at(-1) && !ONE_OFF.test(e.n + e.x)) rows.push({ e, y: last + 1, spec: null, why: `缺少 ${last + 1} 年日期` });
  }
}
rows.sort((a, b) => (a.spec ? start(a.y, a.spec) : new Date(a.y, 11, 31, 23)) - (b.spec ? start(b.y, b.spec) : new Date(b.y, 11, 31, 23)));

const ym = r => r.spec ? `${r.y} 年 ${start(r.y, r.spec).getMonth() + 1} 月` : `${r.y} 年（日期未知）`;
let md = `# 待確認日期的活動\n\n由 \`node scripts/pending-dates.mjs\` 產生，基準日 ${today.toISOString().slice(0, 10)}，共 ${rows.length} 筆待確認日期，另有不是每年舉辦活動的下一屆列在最後。檢查與更新方式見 [date-check.md](date-check.md)。\n`;
let cur = "";
for (const r of rows) {
  const g = ym(r);
  if (g !== cur) { md += `\n## ${g}\n\n| 國家／地區 | 活動 | 類型 | 目前日期 | 狀態 |\n|---|---|---|---|---|\n`; cur = g; }
  md += `| ${r.e.where} | ${r.e.n} | ${TN[r.e.t]} | ${r.spec ? r.spec.replace("~", "～") : "—"} | ${r.why} |\n`;
}
const { future } = read("future.json");
md += `\n## 不是每年舉辦的活動：下一屆（data/future.json，${future.length} 筆）\n\n行事曆目前涵蓋 ${YEARS.join("、")} 年；這些活動的下一屆還不在範圍內，要追蹤日期是否公布或變動。行事曆加入該年份時，移到 events.json。\n\n| 年份 | 國家 | 活動 | 類型 | 目前日期 | 狀態 |\n|---|---|---|---|---|---|\n`;
for (const f of [...future].sort((a, b) => a.year - b.year || (a.d || "13").localeCompare(b.d || "13")))
  md += `| ${f.year} | ${countries[f.c].n} | ${f.n} | ${TN[f.t]} | ${f.d ? f.d.replace("~", "～") : "—"} | ${!f.d ? "日期未公布" : f.a ? "日期可能變動" : "已公布"} |\n`;
writeFileSync(join(root, "docs", "pending-dates.md"), md);
console.log(`docs/pending-dates.md：${rows.length} 筆待確認，另有 ${future.length} 筆未來屆次`);
