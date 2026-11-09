// 冒煙測試：載入頁面並走過主要互動流程，任何頁面錯誤都會讓測試失敗。
// 用法：npm test（會自動啟動本機伺服器）。若環境連不到 CDN，可設定 LIBS_DIR 指向含 d3、topojson 的資料夾。
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { serve } from "../scripts/serve.mjs";

const server = await serve(0);
const page_url = `http://127.0.0.1:${server.address().port}/`;
const libs = process.env.LIBS_DIR;
const results = [];
const check = (name, ok) => results.push({ name, ok });

const browser = await chromium.launch();
const errors = [];

async function open(width, height, colorScheme, url = page_url) {
  const p = await browser.newPage({ viewport: { width, height }, colorScheme });
  p.on("pageerror", e => errors.push(e.message));
  if (libs) {
    await p.route("**/d3.min.js", r => r.fulfill({ body: readFileSync(`${libs}/d3.min.js`), contentType: "text/javascript" }));
    await p.route("**/topojson.min.js", r => r.fulfill({ body: readFileSync(`${libs}/topojson.min.js`), contentType: "text/javascript" }));
  }
  await p.goto(url);
  if (url === page_url) await p.waitForFunction(() => document.querySelectorAll("#map path").length > 100);
  return p;
}

const p = await open(1300, 1000, "light");
const visible = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null; }, sel);

check("資料：61 國", await p.evaluate(() => Object.keys(app.COUNTRIES).length === 61));
check("資料：47 都道府縣", await p.evaluate(() => app.PREFS.length === 47));
check("初始：國家列與日本專區隱藏", !(await visible("#crow")) && !(await visible("#jp")));

await p.click('.chip[data-r="NEA"]');
check("選東北亞：出現國家列", await visible("#crow"));
await p.click('#crow .chip[data-c="JP"]');
check("選日本：出現日本專區", await visible("#jp"));
check("國家按鈕有活動數說明", (await p.textContent("#crow .lab")).includes("月活動數") && /月共 \d+ 項活動/.test(await p.getAttribute('#crow .chip[data-c="JP"]', "title")));
for (const tab of ["s", "nat", "wh", "ev"]) await p.click(`[data-tab="${tab}"]`);

check("日本 11 月推薦分頁有星等與來源", await p.evaluate(() => { Object.assign(app.st, { y: 2026, m: 10, tab: "pk" }); app.render();
  const s = document.getElementById("side"); return s.querySelector('[data-tab="pk"]')?.textContent.includes("11 月推薦") && s.querySelectorAll(".pick").length > 0 && !!s.querySelector(".pick .stars") && !!s.querySelector(".pick .src a[href^='https://']"); }));
check("沒有推薦的月份不顯示推薦分頁", await p.evaluate(() => { app.st.m = 5; app.render(); const ok = !document.querySelector('#side [data-tab="pk"]') && !!document.querySelector('#side [data-tab="s"][aria-selected="true"]'); app.st.m = 10; app.render(); return ok; }));
await p.evaluate(() => app.selectPref("14"));
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
// 「+N 項」在格子內展開與收合
await p.evaluate(() => { Object.assign(app.st, { country: null, region: null, y: 2027, m: 2 }); app.render(); });
const more = p.locator(".more").first();
const cell = more.locator("xpath=..");
const before = await cell.locator(".ev").count();
await more.click();
const expanded = await p.locator(".more").first().locator("xpath=..").locator(".ev").count();
check("「+N 項」展開後顯示全部活動", expanded > before && (await p.locator(".more").first().textContent()) === "收合");
await p.locator(".more").first().click();
check("「收合」後恢復", (await p.locator(".more").first().locator("xpath=..").locator(".ev").count()) === before);
check("頁面無橫向捲動（桌機）", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

const m = await open(390, 1200, "dark");
check("頁面無橫向捲動（手機）", await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

check("沒有頁面錯誤", errors.length === 0);

// 直接開檔（file://）時要顯示如何啟動伺服器，而不是空白頁
const f = await browser.newPage();
await f.goto(new URL("../index.html", import.meta.url).href);
await f.waitForSelector(".load-error", { timeout: 5000 }).catch(() => {});
check("直接開檔時顯示啟動說明", ((await f.textContent(".load-error").catch(() => "")) || "").includes("npm run dev"));

await browser.close();
server.close();

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}`);
if (errors.length) console.log("錯誤：", errors);
if (results.some(r => !r.ok)) process.exit(1);
