// 英文版資料翻譯工具。data/i18n/en.json 是「中文原文 → 英文」的對照表，相同字串只翻一次。
// 每月推薦（picks.json）不翻譯，英文版顯示中文原文並加註。
//   node scripts/i18n.mjs todo [每檔筆數]      把缺少英文的字串依類別分批寫到 i18n-todo/NN.txt（每行「編號<TAB>中文」）
//   node scripts/i18n.mjs apply <中文檔> <英文檔>   英文檔每行「編號<TAB>英文」，併入 en.json
//   node scripts/i18n.mjs stats                  顯示翻譯進度
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = f => JSON.parse(readFileSync(join(root, "data", f), "utf8"));
const EN_FILE = join(root, "data", "i18n", "en.json");

// 需要英文的所有字串，依類別排序（同類放一起，翻譯時有上下文）
export function collect() {
  const out = new Map(); // 中文 → 類別
  const add = (v, cat) => { if (v && !out.has(v)) out.set(v, cat); };
  const R = read("regions.json"), C = read("countries.json"), E = read("events.json").events, J = read("japan.json"), F = read("future.json").future, P = read("picks.json");
  R.regions.forEach(r => add(r.n, "region"));
  for (const c of Object.values(C.countries)) add(c.n, "country");
  J.areas.forEach(a => add(a.n, "jp-area"));
  J.prefectures.forEach(p => add(p.n, "jp-pref"));
  Object.values(P.sourceNames).forEach(v => add(v, "source"));
  for (const [code, c] of Object.entries(C.countries)) { c.s.forEach(v => add(v, `sight:${code}`)); (c.nat || []).forEach(v => add(v, `nature:${code}`)); (c.wh || []).forEach(w => add(w[0], `heritage:${code}`)); add(c.warn, "warning"); }
  Object.values(C.whNote).forEach(v => add(v, "note"));
  E.forEach(e => add(e.n, `event-name:${e.c}`));
  J.national.forEach(e => add(e.n, "event-name:JP"));
  J.prefectures.forEach(p => p.ev.forEach(e => add(e.n, `event-name:JP-${p.n}`)));
  F.forEach(f => add(f.n, `event-name:${f.c}`));
  J.prefectures.forEach(p => { p.s.forEach(v => add(v, `sight:JP-${p.n}`)); p.h.forEach(v => add(v, `historic:JP-${p.n}`)); p.wh.forEach(v => add(v, `heritage:JP-${p.n}`)); });
  E.forEach(e => add(e.x, `event-desc:${e.c}`));
  J.national.forEach(e => add(e.x, "event-desc:JP"));
  J.prefectures.forEach(p => p.ev.forEach(e => add(e.x, `event-desc:JP-${p.n}`)));
  F.forEach(f => add(f.x, `event-desc:${f.c}`));
  return out;
}
export const loadEn = () => JSON.parse(readFileSync(EN_FILE, "utf8"));
const saveEn = m => writeFileSync(EN_FILE, JSON.stringify(Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b))), null, 0).replace(/","/g, '",\n"').replace(/^\{/, "{\n").replace(/\}$/, "\n}\n"));

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [cmd, a, b] = process.argv.slice(2);
  const all = collect(), en = loadEn();
  const missing = [...all].filter(([zh]) => !en[zh]);
  if (cmd === "stats") console.log(`已翻譯 ${all.size - missing.length} / ${all.size}，缺 ${missing.length}`);
  else if (cmd === "todo") {
    const per = +a || 300, dir = join(root, "i18n-todo");
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
    for (let i = 0; i * per < missing.length; i++)
      writeFileSync(join(dir, `${String(i + 1).padStart(2, "0")}.txt`), missing.slice(i * per, (i + 1) * per).map(([zh, cat], j) => `${i * per + j}\t[${cat}] ${zh}`).join("\n") + "\n");
    console.log(`缺 ${missing.length} 筆，寫入 ${Math.ceil(missing.length / per)} 個檔案到 i18n-todo/`);
  } else if (cmd === "apply") {
    const src = Object.fromEntries(readFileSync(a, "utf8").split("\n").filter(Boolean).map(l => { const [n, rest] = l.split("\t"); return [n, rest.replace(/^\[[^\]]*\] /, "")]; }));
    let n = 0;
    for (const l of readFileSync(b, "utf8").split("\n").filter(Boolean)) {
      const i = l.indexOf("\t"); const id = l.slice(0, i), txt = l.slice(i + 1).trim();
      if (!src[id]) throw new Error(`找不到編號 ${id}`);
      if (txt) { en[src[id]] = txt; n++; }
    }
    saveEn(en); console.log(`併入 ${n} 筆`);
  } else console.log("用法見檔案開頭說明");
}
