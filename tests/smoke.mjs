// 冒煙測試：載入頁面並走過主要互動流程，任何頁面錯誤都會讓測試失敗。
// 用法：npm test。若環境連不到 CDN，可設定 LIBS_DIR 指向含 d3、topojson 的資料夾。
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const page_url = new URL("../index.html", import.meta.url).href;
const libs = process.env.LIBS_DIR;
const results = [];
const check = (name, ok) => results.push({ name, ok });

const browser = await chromium.launch();
const errors = [];

async function open(width, height, colorScheme) {
  const p = await browser.newPage({ viewport: { width, height }, colorScheme });
  p.on("pageerror", e => errors.push(e.message));
  if (libs) {
    await p.route("**/d3.min.js", r => r.fulfill({ body: readFileSync(`${libs}/d3.min.js`), contentType: "text/javascript" }));
    await p.route("**/topojson.min.js", r => r.fulfill({ body: readFileSync(`${libs}/topojson.min.js`), contentType: "text/javascript" }));
  }
  await p.goto(page_url);
  await p.waitForFunction(() => document.querySelectorAll("#map path").length > 100);
  return p;
}

const p = await open(1300, 1000, "light");
const visible = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null; }, sel);

check("資料：61 國", await p.evaluate(() => Object.keys(COUNTRIES).length === 61));
check("資料：47 都道府縣", await p.evaluate(() => PREFS.length === 47));
check("初始：國家列與日本專區隱藏", !(await visible("#crow")) && !(await visible("#jp")));

await p.click('.chip[data-r="NEA"]');
check("選東北亞：出現國家列", await visible("#crow"));
await p.click('#crow .chip[data-c="JP"]');
check("選日本：出現日本專區", await visible("#jp"));
for (const tab of ["s", "nat", "wh", "ev"]) await p.click(`[data-tab="${tab}"]`);

await p.evaluate(() => selectPref("14"));
await p.click('[data-ptab="ev"]');
check("神奈川祭典含箱根驛傳", (await p.textContent("#pref")).includes("箱根驛傳"));

await p.click('.seg button[data-view="list"]');
check("全部縣市一覽 47 張卡", (await p.$$eval(".pc", x => x.length)) === 47);
await p.fill("#jpq", "溫泉");
check("一覽搜尋有標亮", (await p.$$eval(".pc mark", x => x.length)) > 0);

await p.click('#crow .chip[data-c="KR"]');
check("切到韓國：日本專區隱藏", !(await visible("#jp")));
await p.selectOption("#year", "2027");
await p.click('#months button[data-m="0"]');
check("頁面無橫向捲動（桌機）", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

const m = await open(390, 1200, "dark");
check("頁面無橫向捲動（手機）", await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

check("沒有頁面錯誤", errors.length === 0);
await browser.close();

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}`);
if (errors.length) console.log("錯誤：", errors);
if (results.some(r => !r.ok)) process.exit(1);
