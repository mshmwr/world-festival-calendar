// 把一個 JSON 檔裡的推薦併入 data/picks.json：node scripts/add-picks.mjs <月份> <檔案>
// 檔案格式：{ "JP": [ {n, pop, x, src, p?}, ... ], "KR": [...] }，同國家會整筆取代
import { readFileSync, writeFileSync } from "node:fs";

const [month, file] = process.argv.slice(2);
const path = new URL("../data/picks.json", import.meta.url);
const doc = JSON.parse(readFileSync(path, "utf8"));
const add = JSON.parse(readFileSync(file, "utf8"));
doc.picks[month] ??= {};
Object.assign(doc.picks[month], add);
const J = x => JSON.stringify(x);
const months = Object.entries(doc.picks).map(([m, byC]) => `    ${J(m)}: {\n` +
  Object.entries(byC).map(([c, items]) => `      ${J(c)}: [\n` + items.map(i => `        ${J(i)}`).join(",\n") + "\n      ]").join(",\n") + "\n    }").join(",\n");
const out = `{\n  "$schema": ${J(doc.$schema)},\n  "sourceNames": ${J(doc.sourceNames)},\n  "picks": {\n${months}\n  }\n}\n`;
JSON.parse(out);
writeFileSync(path, out);
console.log(`${month} 月：${Object.keys(doc.picks[month]).length} 國`);
