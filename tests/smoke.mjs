// 冒煙測試：載入頁面並走過主要互動流程，任何頁面錯誤都會讓測試失敗。
// 用法：npm test（會自動啟動本機伺服器，不需要連網）。
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { serve } from "../scripts/serve.mjs";

const server = await serve(0);
const page_url = `http://127.0.0.1:${server.address().port}/`;
const results = [];
const check = (name, ok) => results.push({ name, ok });

const browser = await chromium.launch();
const errors = [];

async function open(width, height, colorScheme, url = page_url) {
  const p = await browser.newPage({ viewport: { width, height }, colorScheme });
  p.on("pageerror", e => errors.push(e.message));
  // 記錄內容安全政策（CSP）擋下的資源，最後檢查應該一個都沒有
  await p.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  await p.goto(url);
  if (url === page_url) await p.waitForFunction(() => document.querySelectorAll("#map path").length > 100);
  return p;
}

const p = await open(1300, 1000, "light");
const visible = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null; }, sel);

const NC = Object.keys(JSON.parse(readFileSync(new URL("../data/countries.json", import.meta.url), "utf8")).countries).length;
check(`資料：${NC} 國`, await p.evaluate(n => Object.keys(app.COUNTRIES).length === n, NC));
check("資料：47 都道府縣", await p.evaluate(() => app.PREFS.length === 47));
check("初始：國家列與日本專區隱藏", !(await visible("#crow")) && !(await visible("#jp")));

await p.click('.chip[data-r="NEA"]');
check("選東北亞：出現國家列", await visible("#crow"));
await p.click('#crow .chip[data-c="JP"]');
check("選日本：出現日本專區", await visible("#jp"));
check("國家按鈕有活動數說明", (await p.textContent("#crow .lab")).includes("月活動數") && /月共 \d+ 項活動/.test(await p.getAttribute('#crow .chip[data-c="JP"]', "title")));
for (const tab of ["s", "nat", "wh", "ex", "ev"]) await p.click(`[data-tab="${tab}"]`);
await p.click('[data-tab="ex"]');
check("日本有全年體驗分頁", await p.evaluate(() => document.querySelectorAll("#side ul.ex li").length > 3));
await p.click('[data-tab="ev"]');

check("日本 11 月推薦分頁有星等與來源", await p.evaluate(() => { Object.assign(app.st, { y: 2026, m: 10, tab: "pk" }); app.render();
  const s = document.getElementById("side"); return s.querySelector('[data-tab="pk"]')?.textContent.includes("11 月推薦") && s.querySelectorAll(".pick").length > 0 && !!s.querySelector(".pick .stars") && !!s.querySelector(".pick .src a[href^='https://']"); }));
check("沒有推薦的月份不顯示推薦分頁", await p.evaluate(() => {
  const m = [...Array(12).keys()].find(i => !(app.PICKS[i + 1] || {})[app.st.country]);
  if (m === undefined) return true; // 每個月都有推薦時沒有可測的月份
  app.st.m = m; app.render(); const ok = !document.querySelector('#side [data-tab="pk"]') && !!document.querySelector('#side [data-tab="s"][aria-selected="true"]'); app.st.m = 10; app.render(); return ok; }));
await p.evaluate(() => app.selectPref("14"));
await p.click('[data-ptab="ev"]');
check("神奈川祭典含箱根驛傳", (await p.textContent("#pref")).includes("箱根驛傳"));
const prefBefore = await p.evaluate(() => JSON.stringify([app.st.country, app.st.pref, app.st.m, scrollY]));
await p.locator("#pref .item").first().click();
check("縣市面板：點祭典在原地展開介紹，不跳到月曆", await p.evaluate(b => !!document.querySelector("#pref .item.on .ds") && JSON.stringify([app.st.country, app.st.pref, app.st.m, scrollY]) === b, prefBefore));
await p.locator("#pref .item").first().click();

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

// 網址參數：國家頁、月份頁的「在互動行事曆中查看」會帶 ?c= 與 ?m=
const deep = await open(1300, 1000, "light", page_url + "?c=FR&m=7");
await deep.waitForFunction(() => window.app && document.querySelectorAll("#map path").length > 100);
check("網址參數 ?c=FR&m=7 開在法國 7 月", await deep.evaluate(() => app.st.country === "FR" && app.st.m === 6 && document.querySelector("#side").textContent.includes("法國")));

// 靜態國家頁：不需要 JavaScript 也看得到內容
const sp = await browser.newPage({ javaScriptEnabled: false });
await sp.goto(page_url + "c/jp.html");
check("國家頁不靠 JavaScript 就有標題與推薦", (await sp.textContent("h1")).includes("日本") && (await sp.locator("ul.picks li").count()) > 20);
await sp.goto(page_url + "m/2.html");
check("月份頁有各國推薦與節慶", (await sp.locator("h4").count()) === NC && (await sp.locator("ul.evs li").count()) > 10);
// 月份頁的閱讀進度：寬螢幕是右側固定時間軸，窄螢幕是右下角小標籤；內文不再有頂端進度條
const rp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await rp.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective)); });
await rp.goto(page_url + "m/1.html");
await rp.waitForSelector(".sidetl");
check("月份頁沒有頂端進度條、右側時間軸固定且看得到", await rp.evaluate(() => {
  const n = document.querySelector(".sidetl"), r = n.getBoundingClientRect(), main = document.querySelector("main").getBoundingClientRect();
  return !document.querySelector(".readbar") && getComputedStyle(n).position === "fixed" && r.width > 120 && r.left >= main.right && r.right <= innerWidth;
}));
await rp.evaluate(() => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2));
await rp.waitForTimeout(150);
const mid = await rp.evaluate(() => ({ pct: parseInt(document.querySelector(".sidetl .st-h b").textContent), csp: window.__csp.length }));
check("右側時間軸：捲到一半顯示約 50%", mid.pct >= 45 && mid.pct <= 55 && mid.csp === 0);
// 捲到泰國：之前的節點都填色、之後的沒有，東南亞是目前區域；捲動不會自動展開國家
await rp.evaluate(() => scrollTo(0, document.querySelector("#c-th").getBoundingClientRect().top + scrollY - 60));
await rp.waitForTimeout(150);
check("右側時間軸：讀到哪裡標到哪裡，捲動不自動展開", await rp.evaluate(() => {
  const lis = [...document.querySelectorAll(".sidetl li")];
  const i = lis.findIndex(li => li.querySelector('a[href="#c-th"]'));
  const sea = lis.find(li => li.querySelector('a[href="#r-SEA"]'));
  const fill = parseFloat(getComputedStyle(document.querySelector(".sidetl ol")).getPropertyValue("--fill"));
  return i > 0 && lis[i].classList.contains("now") && lis.slice(0, i).every(li => li.classList.contains("past")) && lis.slice(i + 1).every(li => !li.classList.contains("past") && !li.classList.contains("now"))
    && sea.classList.contains("in") && fill > 20 && lis.filter(li => li.classList.contains("c")).every(li => li.hidden) && lis.filter(li => li.classList.contains("r")).every(li => !li.hidden);
}));
await rp.click('.sidetl a[href="#r-SEA"]');
await rp.waitForTimeout(150);
check("右側時間軸：點大項目展開小項目（不跳轉）", await rp.evaluate(() => {
  const shown = [...document.querySelectorAll(".sidetl li.c")].filter(li => !li.hidden).map(li => li.querySelector("a").getAttribute("href"));
  return shown.includes("#c-th") && !shown.includes("#c-jp") && document.querySelector('.sidetl a[href="#r-SEA"]').getAttribute("aria-expanded") === "true" && location.hash !== "#r-SEA";
}));
await rp.click('.sidetl a[href="#r-NEA"]');
await rp.click('.sidetl a[href="#r-SEA"]');
await rp.waitForTimeout(150);
check("右側時間軸：可同時展開多個、再點一次收起", await rp.evaluate(() => {
  const shown = [...document.querySelectorAll(".sidetl li.c")].filter(li => !li.hidden).map(li => li.querySelector("a").getAttribute("href"));
  return shown.includes("#c-jp") && !shown.includes("#c-th");
}));
await rp.click('.sidetl a[href="#c-kr"]');
await rp.waitForTimeout(200);
check("右側時間軸：點小項目跳到該段", await rp.evaluate(() => location.hash === "#c-kr" && document.querySelector(".sidetl li.now a").textContent.includes("韓國")));
await rp.click('nav.toc a[href="#r-SE"]');
await rp.waitForTimeout(200);
check("月份頁區域跳轉：點南歐跳到南歐段落", await rp.evaluate(() => location.hash === "#r-SE"));
// 回報表單：注入按鈕與 js/report.js（不論 site-config 是否已設定後台），攔截送出請求檢查內容
const rf = await browser.newPage({ viewport: { width: 1100, height: 900 } });
let reported = null;
await rf.route("**/__report", async route => { reported = JSON.parse(route.request().postData()); await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); });
await rf.goto(page_url + "c/jp.html");
await rf.evaluate(() => new Promise(res => {
  const b = document.createElement("button"); b.dataset.report = "/__report"; b.id = "rpbtn"; b.textContent = "回報"; document.body.append(b);
  const s = document.createElement("script"); s.src = "../js/report.js"; s.onload = res; document.body.append(s);
}));
await rf.click("#rpbtn");
const rpOpen = await rf.evaluate(() => ({ open: document.querySelector(".report-dlg").open, place: document.querySelector(".report-dlg [name=place]").value }));
await rf.click(".rp-send");
const tooShort = await rf.textContent(".rp-msg");
await rf.fill(".report-dlg [name=content]", "札幌雪祭 2027 年日期是 2/4～2/11");
await rf.selectOption(".report-dlg [name=type]", "日期錯誤");
await rf.click(".rp-send");
await rf.waitForFunction(() => document.querySelector(".rp-msg").classList.contains("ok"));
check("回報表單：開啟時帶入目前國家、內容太短會提示、送出內容正確", rpOpen.open && rpOpen.place === "日本" && tooShort.includes("至少 5 個字")
  && reported?.type === "日期錯誤" && reported.content.includes("札幌") && reported.page.endsWith("/c/jp.html") && reported.website === "");
const mob = await browser.newPage({ viewport: { width: 390, height: 900 } });
await mob.goto(page_url + "m/7.html");
check("月份頁手機版無橫向捲動", await mob.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await mob.evaluate(() => scrollTo(0, document.querySelector("#c-fr").getBoundingClientRect().top + scrollY - 60));
await mob.waitForTimeout(150);
check("手機版：預設向右折疊，列出全部大項目的名稱、目前區域標色，內文不被蓋住", await mob.evaluate(() => {
  const n = document.querySelector(".sidetl"), r = n.getBoundingClientRect(), main = document.querySelector("main").getBoundingClientRect();
  const regions = [...n.querySelectorAll("li.r")], countries = [...n.querySelectorAll("li.c")];
  return n.classList.contains("folded") && getComputedStyle(n).position === "fixed" && r.right <= innerWidth && r.left >= main.right - 1
    && regions.every(li => li.offsetParent && li.querySelector("a").offsetWidth > 20) && countries.every(li => !li.offsetParent)
    && n.querySelector("li.in").textContent.includes("西歐") && n.querySelector("li.r a").textContent.length > 1;
}));
await mob.click('.sidetl a[href="#r-NE"]');
await mob.waitForTimeout(200);
check("手機版：折疊時點大項目名稱直接跳到該段", await mob.evaluate(() => location.hash === "#r-NE" && document.querySelector(".sidetl").classList.contains("folded")));
await mob.click(".sidetl .st-fold");
await mob.click('.sidetl a[href="#r-WE"]');
await mob.waitForTimeout(150);
check("手機版：按 « 展開後，點大項目展開國家", await mob.evaluate(() => {
  const n = document.querySelector(".sidetl");
  return !n.classList.contains("folded") && [...n.querySelectorAll("li.c")].some(li => !li.hidden && li.textContent.includes("法國"));
}));
await mob.click('.sidetl a[href="#c-fr"]');
await mob.waitForTimeout(200);
check("手機版：點國家跳到該段並向右收回", await mob.evaluate(() => location.hash === "#c-fr" && document.querySelector(".sidetl").classList.contains("folded")));
const cp = await browser.newPage({ viewport: { width: 390, height: 900 } });
await cp.goto(page_url + "c/jp.html");
check("國家頁手機版：折疊時也列出 12 個月份名稱", await cp.evaluate(() => {
  const r = [...document.querySelectorAll(".sidetl li.r")];
  return r.length === 12 && r.every(li => li.offsetParent && li.querySelector("a").offsetWidth > 15);
}));

// 點月曆的日期：右側改列當天活動，再點一次或按按鈕回到整個月
await p.evaluate(() => { Object.assign(app.st, { y: 2027, m: 1, region: null, country: null, ev: null, day: null, q: "", openDay: null }); app.render(); });
await p.click('.dbtn[data-day="2027-02-06"]');
const dayInfo = await p.evaluate(() => {
  const d = new Date(2027, 1, 6);
  const expect = app.ALL.filter(x => app.st.types[x.t] && x.s <= d && x.e >= d).length;
  const counted = [...document.querySelectorAll("#side .day-panel .grp-d summary small")].reduce((a, e) => a + parseInt(e.textContent), 0);
  const g = k => document.querySelector(`#side .grp-d[data-g="${k}"]`);
  return { day: app.st.day, title: document.querySelector("#side .day-panel h3")?.textContent || "", counted, expect, monthList: document.querySelector("#side").textContent.includes("2 月節慶活動"), picked: !!document.querySelector('.cell.picked[data-day="2027-02-06"]'),
    startOpen: g("day:start")?.open, onOpen: g("day:on")?.open, seasonOpen: g("day:season")?.open };
});
check("點日期：右側列出當天全部活動（各組數字加總）", dayInfo.day === "2027-02-06" && dayInfo.title.includes("2 月 6 日（六）") && dayInfo.counted === dayInfo.expect && dayInfo.counted > 0 && !dayInfo.monthList && dayInfo.picked);
check("點日期：「當天開始」展開，「進行中」「適合前往」收合", dayInfo.startOpen === true && dayInfo.onOpen === false && dayInfo.seasonOpen === false);
await p.click("#clearDay");
check("取消選取日期後回到整個月", await p.evaluate(() => app.st.day === null && document.querySelector("#side").textContent.includes("2 月節慶活動") && !document.querySelector(".cell.picked")));
await p.locator('.cell[data-day="2027-02-10"]').click({ position: { x: 40, y: 98 } });
check("點格子空白處也能選取日期", await p.evaluate(() => app.st.day === "2027-02-10"));
await p.locator('.cell[data-day="2027-02-10"]').click({ position: { x: 40, y: 98 } });
check("再點一次取消選取", await p.evaluate(() => app.st.day === null));
const chip = p.locator('.cell[data-day="2027-02-06"] .ev').first();
const chipId = await chip.getAttribute("data-id");
await chip.click();
check("點格子裡的活動：列出當天並展開該項介紹，不篩選國家", await p.evaluate(id => app.st.day === "2027-02-06" && app.st.country === null && app.st.region === null
  && !!document.querySelector(`#side .day-panel .item.on[data-id="${id}"] .ds`), chipId));
await p.evaluate(() => { Object.assign(app.st, { ev: null, day: null, country: "JP", region: "NEA" }); app.st.open.clear(); app.render(); });
await p.click('.dbtn[data-day="2027-02-06"]');
check("已選國家時：當天面板只列該國，國家卡片仍在", await p.evaluate(() => {
  const items = [...document.querySelectorAll("#side .day-panel .item")];
  return items.length > 0 && items.every(b => app.ALL.find(x => x.id === b.dataset.id).c === "JP") && !!document.querySelector("#side .country-head");
}));
await p.click("#next");
check("換月份時取消選取日期", await p.evaluate(() => app.st.day === null && !document.querySelector("#side .day-panel")));
await p.evaluate(() => { app.selectCountry("JP"); app.st.y = new Date().getFullYear(); app.st.m = new Date().getMonth(); app.render(); });

// 長清單：分組每組先列 6 項、可展開全部；說明只在選取時顯示；桌機右側不超過一個畫面高
await p.evaluate(() => { Object.assign(app.st, { y: 2027, m: 7, region: null, country: null, ev: null, day: null }); app.st.open.clear(); app.render(); });
const longList = await p.evaluate(() => {
  const gs = [...document.querySelectorAll('#side .grp-d[data-g^="mon:"]')].filter(d => d.dataset.g !== "mon:season");
  return { groups: gs.length, maxShown: Math.max(...gs.map(d => d.querySelectorAll(".item").length)), anyMore: !!document.querySelector("#side .more-g"),
    desc: document.querySelectorAll("#side .item .ds").length, items: document.querySelectorAll("#side .item").length, sideH: document.getElementById("side").getBoundingClientRect().height, vh: innerHeight };
});
check("整月清單：每組最多先列 6 項", longList.groups > 3 && longList.maxShown <= 6 && longList.anyMore);
check("整月清單：沒點開的項目不顯示介紹", longList.items > 0 && longList.desc === 0);
check("桌機：右側清單不超過一個畫面高", longList.sideH <= longList.vh);
const moreKey = await p.evaluate(() => document.querySelector("#side .more-g").dataset.g);
const moreTotal = await p.evaluate(k => parseInt(document.querySelector(`#side .grp-d[data-g="${k}"] summary small`).textContent), moreKey);
await p.click(`#side .more-g[data-g="${moreKey}"]`);
check("按「顯示全部」後列出該組全部項目", await p.evaluate(([k, n]) => document.querySelectorAll(`#side .grp-d[data-g="${k}"] .item`).length === n && !document.querySelector(`#side .more-g[data-g="${k}"]`), [moreKey, moreTotal]));
await p.click(`#side .grp-d[data-g="${moreKey}"] summary`);
await p.evaluate(() => app.render());
check("收合過的分組重畫後仍維持收合", await p.evaluate(k => document.querySelector(`#side .grp-d[data-g="${k}"]`).open === false, moreKey));
await p.click(`#side .grp-d[data-g="${moreKey}"] summary`);
const filtersBefore = await p.evaluate(() => JSON.stringify([app.st.country, app.st.region, app.st.m, app.st.y, app.st.day, app.st.tab]));
// 選一個還有「顯示全部」按鈕（只列 6 項）的分組裡的第一項
const firstId = await p.evaluate(() => document.querySelector("#side .more-g").closest(".grp-d").querySelector(".item").dataset.id);
await p.locator(`#side .item[data-id="${firstId}"]`).click();
check("點清單項目：在原地展開介紹", await p.evaluate(id => { const on = document.querySelector(`#side .item.on[data-id="${id}"]`); return !!on && !!on.querySelector(".ds") && on.getAttribute("aria-expanded") === "true"; }, firstId));
check("點清單項目：不改變國家、區域、月份等篩選", await p.evaluate(b => JSON.stringify([app.st.country, app.st.region, app.st.m, app.st.y, app.st.day, app.st.tab]) === b && !document.querySelector("#side .country-head") && document.querySelector("#side").textContent.includes("8 月節慶活動"), filtersBefore));
check("點清單項目：不會把整組變成全部列出", await p.evaluate(id => { const d = document.querySelector(`#side .item[data-id="${id}"]`).closest(".grp-d"); return d.querySelectorAll(".item").length === 6 && !!d.querySelector(".more-g"); }, firstId));
check("點清單項目：月曆標出該活動的期間", await p.evaluate(() => document.querySelectorAll("#grid .cell.span").length > 0));
await p.locator(`#side .item[data-id="${firstId}"]`).click();
check("再點一次收合介紹", await p.evaluate(id => !document.querySelector(`#side .item[data-id="${id}"] .ds`) && !document.querySelector("#grid .cell.span"), firstId));
await p.evaluate(() => { Object.assign(app.st, { ev: null, country: "JP", region: "NEA", tab: "ev", m: 4 }); app.st.open.clear(); app.render(); });
check("國家節慶分頁：按月份分組，只展開目前月份", await p.evaluate(() => {
  const gs = [...document.querySelectorAll('#side .grp-d[data-g^="cev:"]')];
  return gs.length >= 10 && gs.filter(d => d.open).map(d => d.dataset.g).join() === "cev:4";
}));
await p.evaluate(() => { Object.assign(app.st, { country: null, region: null, tab: "pk", y: new Date().getFullYear(), m: new Date().getMonth() }); app.render(); });

// 搜尋框輸入的 HTML 只能當文字顯示，不能變成元素或執行
await p.fill("#q", '<img src=x onerror="window.__xss=1">');
await p.waitForTimeout(200);
check("搜尋文字不會被當成 HTML 執行", await p.evaluate(() => !document.querySelector("#af img") && !window.__xss && document.querySelector("#af").textContent.includes("<img")));
await p.fill("#q", "");

const violations = [...await p.evaluate(() => window.__csp), ...await deep.evaluate(() => window.__csp), ...await m.evaluate(() => window.__csp)];
check("內容安全政策沒有擋下任何資源", violations.length === 0);
if (violations.length) console.log("CSP：", violations);

// 本機伺服器不提供 .git 等隱藏檔案
const hidden = await fetch(page_url + ".git/HEAD");
check("本機伺服器拒絕 .git 檔案", hidden.status === 403);

// 英文版：介面、國名與活動說明都是英文，資料從根目錄載入
const en = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
en.on("pageerror", e => errors.push(e.message));
await en.goto(page_url + "en/");
await en.waitForFunction(() => document.querySelectorAll("#map path").length > 100);
await en.click('.chip[data-r="NEA"]');
await en.click('#crow .chip[data-c="JP"]');
const enText = await en.evaluate(() => document.body.innerText);
check("英文版：顯示英文國名與介面", enText.includes("Japan") && enText.includes("Public holiday"));
await en.click('[data-tab="ev"]');
check("英文版：活動清單沒有殘留中文", await en.evaluate(() => { const t = [...document.querySelectorAll("#side, #mtitle, #crow")].map(e => e.innerText).join(""); return !/[\u4e00-\u9fff]/.test(t.replace(/[（）]/g, "")); }));
await en.goto(page_url + "en/c/jp.html");
check("英文國家頁可開啟", (await en.textContent("h1")).includes("Japan"));

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
