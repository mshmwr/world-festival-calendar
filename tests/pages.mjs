// 檢查 scripts/build-pages.mjs 產生的靜態頁面是最新的，而且每頁都有搜尋引擎需要的基本標記
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, normalize } from "node:path";
import { build, SITE } from "../scripts/build-pages.mjs";

const root = new URL("..", import.meta.url).pathname;
let failed = 0;
const fail = (where, msg) => { failed++; console.log(`FAIL ${where}：${msg}`); };

const files = build();
for (const [p, s] of Object.entries(files)) {
  const f = join(root, p);
  if (!existsSync(f)) fail(p, "檔案不存在，請執行 node scripts/build-pages.mjs");
  else if (readFileSync(f, "utf8") !== s) fail(p, "內容不是最新的，改過 data/ 後請執行 node scripts/build-pages.mjs");
}
for (const dir of ["c", "m"]) for (const f of readdirSync(join(root, dir))) if (!files[`${dir}/${f}`]) fail(`${dir}/${f}`, "多出來的舊檔案，請執行 node scripts/build-pages.mjs");

const titles = new Map(), descs = new Map();
for (const [p, s] of Object.entries(files)) {
  if (!p.endsWith(".html")) continue;
  const title = s.match(/<title>([^<]+)<\/title>/)?.[1];
  const desc = s.match(/<meta name="description" content="([^"]+)">/)?.[1];
  const canon = s.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
  if (!title) fail(p, "缺少 <title>");
  if (!desc) fail(p, "缺少 meta description");
  else if (desc.length > 120) fail(p, `meta description 太長（${desc.length} 字）`);
  if (canon !== SITE + (p === "index.html" ? "" : p)) fail(p, `canonical 不正確：${canon}`);
  if ((s.match(/<h1[\s>]/g) || []).length !== 1) fail(p, "應該剛好有一個 <h1>");
  if (!s.includes('property="og:image"')) fail(p, "缺少 og:image");
  if (!s.includes('http-equiv="Content-Security-Policy"')) fail(p, "缺少內容安全政策（CSP）");
  for (const m of s.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { fail(p, "JSON-LD 不是合法的 JSON"); }
  }
  if (titles.has(title)) fail(p, `標題和 ${titles.get(title)} 重複`); else titles.set(title, p);
  if (descs.has(desc)) fail(p, `說明和 ${descs.get(desc)} 重複`); else descs.set(desc, p);
  // 站內連結都要指到存在的檔案
  for (const [, href] of s.matchAll(/href="([^"#?]*)(?:[#?][^"]*)?"/g)) {
    if (!href || /^(https?:|mailto:)/.test(href)) continue;
    const target = normalize(join(dirname(p), href));
    const f = join(root, target.endsWith("/") || target === "." ? join(target, "index.html") : target);
    if (!existsSync(f)) fail(p, `連結指到不存在的檔案：${href}`);
  }
}
const locs = [...files["sitemap.xml"].matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const pages = Object.keys(files).filter(p => p.endsWith(".html") && p !== "index.html");
if (locs.length !== pages.length + 1) fail("sitemap.xml", `應有 ${pages.length + 1} 個網址，實際 ${locs.length} 個`);
if (!existsSync(join(root, "og.png"))) fail("og.png", "分享圖不存在，請執行 node scripts/make-og.mjs");

if (failed) { console.log(`\n${failed} 項靜態頁面檢查未通過`); process.exit(1); }
console.log(`PASS 靜態頁面：${pages.length} 頁、sitemap ${locs.length} 個網址，內容為最新`);
