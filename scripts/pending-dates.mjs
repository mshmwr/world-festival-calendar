// 列出日期還沒確定的活動，產生 docs/pending-dates.md
// 用法：node scripts/pending-dates.mjs [YYYY-MM-DD] [--within 天數] [--max 筆數]
//   預設基準日為今天，只列今天以後還會發生的。
//   另外產生 docs/check-batch.md：這次要查的精簡批次（--within 天內開始、最多 --max 筆，預設 100 天、60 筆），
//   依「一次搜尋能確認多筆」分組；每月例行檢查只需要讀這個檔案。
// 兩種情況會列出：
//   1. 標 "a":1 的推估日期（農曆、伊斯蘭曆、主辦單位尚未公布等）
//   2. 每年都辦、但缺少明年日期的活動（只有今年的 y）
//   3. data/future.json 裡不是每年舉辦的活動（奧運、亞運、世界盃、隔年祭典等）的下一屆
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = f => JSON.parse(readFileSync(join(root, "data", f), "utf8"));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const dateArg = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
const today = dateArg ? new Date(dateArg) : new Date();
const WITHIN = opt("--within", 100), MAX = opt("--max", 60);
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

// ---- 本次檢查批次：只取近期項目，依查證方式分組，減少搜尋次數 ----
const ISLAMIC = /開齋|宰牲|齋月|回曆|先知誕辰|登霄|阿舒拉|阿拉法|古蘭經|Hayit|Ramazon/;
// 小型活動不主動查證：祭典與季節只有在「每月推薦」有提到時才列入批次，其餘維持「約」，等使用者回報再改
const { picks } = read("picks.json");
const pickText = Object.values(picks).flatMap(byC => Object.values(byC).flat()).map(it => it.n + it.x).join("\n");
const core = n => n.replace(/（.*?）/g, "").split("・")[0].trim();
const major = r => r.e.t === "H" || r.e.t === "G" || pickText.includes(core(r.e.n));
const day = 864e5;
const soon = rows.filter(r => r.spec && (start(r.y, r.spec) - today) / day <= WITHIN);
const groups = { islamic: [], holiday: {}, f1: [], other: [] };
let skippedIslamic = 0, skippedMinor = 0;
for (const r of soon) {
  if (!major(r)) { skippedMinor++; continue; }
  const days = (start(r.y, r.spec) - today) / day;
  if (ISLAMIC.test(r.e.n)) { if (days <= 21) groups.islamic.push(r); else skippedIslamic++; }
  else if (r.e.t === "H") (groups.holiday[r.e.where] ||= []).push(r);
  else if (/^F1 /.test(r.e.n)) groups.f1.push(r);
  else groups.other.push(r);
}
const line = r => `- ${r.e.where}｜${r.e.n}｜${r.y} 年 ${r.spec.replace("~", "～")}`;
let n = 0, bm = `# 本次日期檢查批次\n\n基準日 ${today.toISOString().slice(0, 10)}；只列 ${WITHIN} 天內開始的待確認項目（完整清單見 pending-dates.md）。依分組查證：同一組用一次搜尋確認。\n`;
const take = xs => { const out = xs.slice(0, Math.max(0, MAX - n)); n += out.length; return out; };
const hol = Object.entries(groups.holiday);
if (hol.length) { bm += `\n## 國定假日（每國查一次政府公告的年度假日表）\n`; for (const [w, xs] of hol) { const t = take(xs); if (t.length) bm += `\n### ${w}\n${t.map(line).join("\n")}\n`; } }
if (groups.f1.length) bm += `\n## F1（查一次官方賽曆即可）\n${take(groups.f1).map(line).join("\n")}\n`;
if (groups.islamic.length) bm += `\n## 伊斯蘭節日（3 週內，查當地政府公告）\n${take(groups.islamic).map(line).join("\n")}\n`;
if (groups.other.length) bm += `\n## 祭典、賽事、季節（查主辦單位官網）\n${take(groups.other).map(line).join("\n")}\n`;
const rest = soon.length - n - skippedIslamic - skippedMinor;
bm += `\n---\n本批 ${n} 筆。${rest > 0 ? `另有 ${rest} 筆近期項目超過本批上限，下次處理。` : ""}${skippedIslamic ? `${skippedIslamic} 筆伊斯蘭節日距今超過 3 週，官方要到前幾天才公告，本次略過。` : ""}${skippedMinor ? `${skippedMinor} 筆小型祭典（每月推薦沒提到）不主動查證，維持「約」，有人回報再改。` : ""}\n`;
const fut = future.filter(f => !f.d || f.a);
bm += `\n## 未來屆次（只看有沒有新消息，一兩次搜尋即可）\n${fut.map(f => `- ${f.year}｜${countries[f.c].n}｜${f.n}${f.d ? `｜${f.d}（暫定）` : "｜日期未公布"}`).join("\n")}\n`;
writeFileSync(join(root, "docs", "check-batch.md"), bm);
console.log(`docs/pending-dates.md：${rows.length} 筆待確認，另有 ${future.length} 筆未來屆次；docs/check-batch.md：本批 ${n} 筆`);
