// 產生給搜尋引擎讀的靜態頁面：每國一頁（c/<代碼>.html）、每月一頁（m/<月>.html）、sitemap.xml，
// 並更新 index.html 裡 <!-- seo:links --> 標記之間的連結清單。
// 主頁的內容是 JavaScript 畫出來的，這些頁面讓內容在不執行 JavaScript 時也讀得到。
// 用法：node scripts/build-pages.mjs        改過 data/ 之後執行，再 commit 產生的檔案
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export const SITE = "https://mshmwr.github.io/world-festival-calendar/";
export const SITE_NAME = "環球節慶行事曆";
// 贊助、廣告、聯盟行銷的設定在 js/site-config.js
import { SITE_CONFIG, HAS_AFFILIATE, AFFILIATE_NOTE, affLink, cspFor, adsenseScript, gaScript } from "../js/site-config.js";
export const SUPPORT_URL = SITE_CONFIG.support;
const supportHTML = (up = "") => (SUPPORT_URL ? `<div class="support"><p>這個行事曆免費使用。如果它幫你排好了旅行，歡迎請我喝杯咖啡，支持資料持續更新。</p><a class="kofi" href="${SUPPORT_URL}" target="_blank" rel="noopener">☕ 在 Ko-fi 請我喝杯咖啡</a></div>` : "")
  + `<p class="legal">${SITE_CONFIG.reportEndpoint ? `<button type="button" class="report" data-report="${SITE_CONFIG.reportEndpoint}">📮 回報錯誤或建議</button>　` : ""}${HAS_AFFILIATE ? AFFILIATE_NOTE + " " : ""}<a href="${up}about.html">關於本站</a>　<a href="${up}contact.html">聯絡我們</a>　<a href="${up}privacy.html">隱私權政策</a></p>`
  + (SITE_CONFIG.reportEndpoint ? `<script src="${up}js/report.js" defer></script>` : "");
const PAGE_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";
const YEAR = 2027; // 靜態頁的節慶日期以這一年為準，沒有這一年的資料就用前一年
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const TYPE_N = { H: "國定假日", F: "祭典活動", G: "體育賽事", S: "旅遊季節" };
const WN = { "文": "文化", "自": "自然", "複": "複合" };

const root = new URL("..", import.meta.url).pathname;
const read = f => JSON.parse(readFileSync(join(root, "data", f), "utf8"));

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const stars = n => "★".repeat(n) + "☆".repeat(3 - n);
// 說明文字：開頭 + 盡量多的熱門項目（整項放入，不切斷）+ 結尾，總長不超過 max
function fit(head, items, tail, max = 110) {
  const out = [];
  for (const it of items) { if ((head + [...out, it].join("、") + "。" + tail).length > max) break; out.push(it); }
  return head + (out.length ? out.join("、") + "。" : "") + tail;
}

function loadAll() {
  const { regions } = read("regions.json");
  const { countries } = read("countries.json");
  const { events } = read("events.json");
  const japan = read("japan.json");
  const { picks, sourceNames } = read("picks.json");
  const { future } = read("future.json");
  const evs = [...events];
  for (const e of japan.national) evs.push({ c: "JP", ...e });
  for (const p of japan.prefectures) for (const e of p.ev) evs.push({ c: "JP", t: "F", ...e, p: p.id });
  const prefName = Object.fromEntries(japan.prefectures.map(p => [p.id, p.n]));
  return { regions, countries, evs, japan, picks, sourceNames, prefName, future };
}

// 一筆節慶在 YEAR（或前一年）的起訖月日；回傳 {y, s:[m,d], e:[m,d], months:Set}
function span(e) {
  const y = e.d ? YEAR : (e.y?.[YEAR] ? YEAR : e.y?.[YEAR - 1] ? YEAR - 1 : null);
  if (y === null) return null;
  const [a, b = a] = (e.d || e.y[y]).split("~");
  const s = a.split("-").map(Number), en = b.split("-").map(Number);
  const months = new Set();
  const cross = en[0] < s[0] || (en[0] === s[0] && en[1] < s[1]);
  for (let m = s[0]; ; m = m % 12 + 1) { months.add(m); if (m === en[0]) break; }
  return { y, s, e: en, months, cross };
}
const fmtSpan = x => {
  const f = ([m, d]) => `${m}/${d}`;
  const t = x.s[0] === x.e[0] && x.s[1] === x.e[1] ? f(x.s) : `${f(x.s)}–${f(x.e)}`;
  return x.y === YEAR ? t : `${t}（${x.y} 年）`;
};
const sortKey = x => x.s[0] * 100 + x.s[1];

function sourceName(url, names) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const key = Object.keys(names).find(d => host === d || host.endsWith("." + d));
  return key ? names[key] : host;
}

// ---------- 共用版型 ----------
// 中英版本互相對應的 hreflang 標記；zh、en 為相對 SITE 的路徑
const hreflang = (zh, en) => `<link rel="alternate" hreflang="zh-Hant" href="${SITE}${zh}">\n<link rel="alternate" hreflang="en" href="${SITE}${en}">\n<link rel="alternate" hreflang="x-default" href="${SITE}${zh}">`;
function page({ path, title, desc, h1, lead, crumbs, body, ld, en }) {
  const url = SITE + path;
  const depth = path.split("/").length - 1;
  const up = "../".repeat(depth);
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: crumbs.map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + p })),
  };
  const lds = [breadcrumb, ...(ld ? [ld] : [])].map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n");
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${cspFor(PAGE_CSP)}">${[gaScript(up), adsenseScript()].filter(Boolean).map(x => "\n" + x).join("")}
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">${en ? "\n" + hreflang(path, en) : ""}
<meta name="theme-color" content="#0e5a76">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="zh_TW">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${up}favicon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="${up}favicon-192.png">
<link rel="stylesheet" href="${up}css/page.css">
<script src="${up}js/page.js" defer></script>
${lds}
</head>
<body>
<div class="wrap" id="top">
${en ? `<p class="lang"><a href="${up}${en}" hreflang="en" lang="en">English</a></p>` : ""}<nav class="crumb" aria-label="導覽路徑">${crumbs.map(([n, p], i) => i === crumbs.length - 1 ? `<span aria-current="page">${esc(n)}</span>` : `<a href="${up}${p}">${esc(n)}</a>`).join(" › ")}</nav>
<header>
<h1>${esc(h1)}</h1>
<p class="lead">${esc(lead)}</p>
</header>
<main>
${body}
</main>
<footer>
${supportHTML(up)}
<p>標「約」的日期是依往年慣例或農曆、伊斯蘭曆推算的估計值，以主辦單位當年公告為準。推薦熱門程度：★★★ 多家台灣旅行社排入當月行程或是當月最具代表性的活動，★★ 一兩家旅行社或主要旅遊網站推薦，★ 觀光局或旅遊指南推薦。</p>
<p><a href="${up}">回到${SITE_NAME}</a></p>
</footer>
</div>
</body>
</html>
`;
}

// 同一來源有好幾個連結時加上編號，例如「東南旅遊 1、東南旅遊 2」
function srcLinks(urls, names) {
  const ns = urls.map(u => sourceName(u, names)), seen = {};
  return urls.map((u, i) => {
    const dup = ns.filter(n => n === ns[i]).length > 1;
    const label = dup ? `${ns[i]} ${seen[ns[i]] = (seen[ns[i]] || 0) + 1}` : ns[i];
    const l = affLink(u);
    return `<a href="${esc(l.href)}" rel="nofollow noopener${l.sponsored ? " sponsored" : ""}" target="_blank">${esc(label)}</a>`;
  }).join("、");
}
const pickLi = (it, names, extra = "") => `<li><span class="stars" aria-label="熱門程度 ${it.pop} 顆星">${stars(it.pop)}</span> <b>${esc(it.n)}</b>${extra}<br>${esc(it.x)}<br><small>來源：${srcLinks(it.src, names)}</small></li>`;
// 有查證來源的活動（季節性體驗）附上來源連結
const evSrc = (x, label, sep) => x.src?.length ? ` <small class="src">${label}${x.src.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(new URL(u).hostname.replace(/^www\./, ""))}</a>`).join(sep)}</small>` : "";
const evLi = (x, extra = "") => `<li><span class="dt">${fmtSpan(x.span)}${x.a ? "（約）" : ""}</span> <span class="t ${x.t}">${TYPE_N[x.t]}</span> <b>${esc(x.n)}</b>${extra}：${esc(x.x)}${evSrc(x, "來源：", "、")}</li>`;

function regionNav(D, up, current) {
  return `<nav class="all" aria-labelledby="all-h"><h2 id="all-h">各國頁面</h2>${D.regions.map(r => {
    const cs = Object.entries(D.countries).filter(([, c]) => c.r === r.k);
    return `<p><b>${esc(r.n)}</b> ${cs.map(([k, c]) => k === current ? `<span>${esc(c.n)}</span>` : `<a href="${up}c/${k.toLowerCase()}.html">${esc(c.n)}</a>`).join(" ")}</p>`;
  }).join("")}</nav>`;
}
const monthNav = (up, current) => `<nav class="months" aria-label="各月推薦">${MONTHS.map(m => m === current ? `<span>${m} 月</span>` : `<a href="${up}m/${m}.html">${m} 月</a>`).join(" ")}</nav>`;

// ---------- 國家頁 ----------
// 未來幾年的大型活動（奧運、世界盃等），日期未定的標示出來
function futureHTML(D, code) {
  const xs = D.future.filter(f => f.c === code).sort((a, b) => a.year - b.year);
  if (!xs.length) return "";
  const when = f => f.d ? `${f.year} 年 ${f.d.split("~").map(x => x.replace(/^0/, "").replace("-0", "/").replace("-", "/")).join("–")}${f.a ? "（暫定）" : ""}` : `${f.year} 年（日期未公布）`;
  return `<section><h2>未來的大型活動</h2><ul class="evs">${xs.map(f => `<li><span class="dt">${when(f)}</span> <span class="t ${f.t}">${TYPE_N[f.t]}</span> <b>${esc(f.n)}</b>：${esc(f.x)}</li>`).join("")}</ul></section>`;
}

function countryPage(D, code) {
  const c = D.countries[code];
  const rn = D.regions.find(r => r.k === c.r).n;
  const evs = D.evs.filter(e => e.c === code).map(e => ({ ...e, span: span(e) })).filter(e => e.span).sort((a, b) => sortKey(a.span) - sortKey(b.span));
  const short = n => n.split("：")[0];
  const top = [...new Set(MONTHS.flatMap(m => (D.picks[m]?.[code] || []).filter(p => p.pop === 3).map(p => `${m} 月${short(p.n)}`)))];
  const desc = fit(`${c.n}每月推薦景點與行程，依台灣旅行社熱門程度標星，附節日、祭典與世界遺產。${top.length ? "熱門：" : ""}`, top, "");
  const prefLabel = it => it.p ? `（${esc(D.prefName[it.p])}）` : "";
  const picksHTML = MONTHS.map(m => {
    const items = [...(D.picks[m]?.[code] || [])].sort((a, b) => b.pop - a.pop);
    if (!items.length) return "";
    return `<li class="tl-c"><h3 id="m${m}">${m} 月</h3><ul class="picks">${items.map(it => pickLi(it, D.sourceNames, prefLabel(it))).join("")}</ul></li>`;
  }).join("");
  const evHTML = evs.length ? `<ul class="evs">${evs.map(x => evLi(x, x.p ? `（${esc(D.prefName[x.p])}）` : "")).join("")}</ul>` : "<p>目前沒有資料。</p>";
  const list = (h, xs) => xs?.length ? `<section><h2>${h}</h2><ul class="tags">${xs.map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>` : "";
  const wh = c.wh?.length ? `<section><h2>世界遺產</h2><ul class="tags">${c.wh.map(([n, k]) => `<li>${esc(n)}<small>（${WN[k]}）</small></li>`).join("")}</ul></section>` : "";
  const prefs = code === "JP" ? `<section><h2>日本 47 都道府縣</h2>${D.japan.areas.map(a => `<p><b>${esc(a.n)}</b> ${D.japan.prefectures.filter(p => p.a === a.k).map(p => esc(p.n)).join("、")}</p>`).join("")}<p>各縣市的景點、遺跡、世界遺產與祭典，請到<a href="../?c=JP">互動行事曆的日本專區</a>查看。</p></section>` : "";
  const body = `<p class="cta"><a href="../?c=${code}">在互動行事曆中查看${esc(c.n)} →</a></p>
${monthNav("../")}
<section><h2>${esc(c.n)}每月推薦景點與行程</h2><ol class="tl">${picksHTML}</ol></section>
<section><h2>${esc(c.n)}節日、祭典與旅遊季節（${YEAR} 年）</h2>${evHTML}</section>
${futureHTML(D, code)}
${list("熱門景點", c.s)}${list("自然景色", c.nat)}${list("全年體驗", c.ex)}${prefEx(D, code, "zh")}${wh}${prefs}
${regionNav(D, "../", code)}`;
  return page({
    path: `c/${code.toLowerCase()}.html`, en: `en/c/${code.toLowerCase()}.html`,
    title: `${c.n}旅遊行事曆｜每月推薦景點、節日與祭典｜${SITE_NAME}`,
    desc, h1: `${c.f} ${c.n}旅遊行事曆`,
    lead: `${rn}・${c.n}一年 12 個月的推薦景點與行程、國定假日、祭典活動與最佳旅遊季節，以及熱門景點、自然景色與世界遺產。`,
    crumbs: [[SITE_NAME, ""], [c.n, `c/${code.toLowerCase()}.html`]],
    body,
    ld: { "@context": "https://schema.org", "@type": "TouristDestination", name: c.n, description: desc, url: SITE + `c/${code.toLowerCase()}.html`, touristType: "觀光旅客", includesAttraction: c.s.slice(0, 20).map(n => ({ "@type": "TouristAttraction", name: n })) },
  });
}

// ---------- 月份頁 ----------
// 月份頁的常見問題：全部從現有資料產生，回傳 [[問題, 回答], …]
const FAQ_COUNTRIES = ["JP", "KR", "TH"];
function monthFAQ(D, m, all, evs) {
  const cname = code => D.countries[code].n;
  const label = it => { const n = it.n.split("：")[0]; return n.includes(cname(it.code)) ? n : `${cname(it.code)}${n}`; };
  const list = xs => xs.join("、");
  const out = [];
  const best = Math.max(...all.map(it => it.pop));
  const hot = all.filter(it => it.pop === best);
  const countries = [...new Set(hot.map(it => it.code))].map(cname);
  out.push([`${m} 月出國去哪裡最熱門？`,
    `依台灣旅行社 ${m} 月的出團與推薦，${best === 3 ? "最熱門（★★★）" : "較熱門（★★）"}的是：${list(hot.map(label))}。` +
    `涵蓋${list(countries)}共 ${countries.length} 國；全部 ${new Set(all.map(it => it.code)).size} 國、${all.length} 項推薦依區域列在本頁。`]);
  for (const code of FAQ_COUNTRIES) {
    const items = [...(D.picks[m]?.[code] || [])].sort((a, b) => b.pop - a.pop);
    if (!items.length) continue;
    const [first] = items;
    out.push([`${m} 月去${cname(code)}玩什麼？`,
      `${m} 月${cname(code)}推薦：${list(items.map(it => `${it.n.split("：")[0]}（${stars(it.pop)}）`))}。${first.x}`]);
  }
  const hol = evs.filter(e => e.t === "H");
  if (hol.length) {
    const MAX = 14;
    const shown = hol.slice(0, MAX).map(e => `${cname(e.c)}${e.n}（${fmtSpan(e.span)}）`);
    out.push([`${YEAR} 年 ${m} 月有哪些國家放假？`,
      `${YEAR} 年 ${m} 月共有 ${hol.length} 個國定假日或連假：${list(shown)}${hol.length > MAX ? " 等" : ""}。` +
      `當地放假時景點和交通較擠、部分商店會休息，訂票前先確認；完整日期見本頁「${m} 月各國節日與祭典」。`]);
  }
  out.push(["推薦的星等是怎麼決定的？",
    "★★★ 代表多家台灣旅行社把它排進當月行程，或是當月最具代表性的活動；★★ 是一兩家旅行社或主要旅遊網站推薦；★ 是觀光局或旅遊指南推薦。每項推薦都附資料來源連結。"]);
  return out;
}

function monthPage(D, m) {
  const byCountry = D.picks[m] || {};
  const all = Object.entries(byCountry).flatMap(([code, items]) => items.map(it => ({ ...it, code })));
  const top = all.filter(it => it.pop === 3);
  const cname = code => D.countries[code].n;
  const desc = fit(`${m} 月出國去哪玩？${Object.keys(byCountry).length} 國 ${m} 月推薦景點依旅行社熱門程度標星，附各國節日。${top.length ? "最熱門：" : ""}`, top.map(it => { const n = it.n.split("：")[0]; return n.includes(cname(it.code)) ? n : cname(it.code) + n; }), "");
  const topHTML = top.length ? `<section><h2>${m} 月最熱門（★★★）</h2><ul class="picks">${top.map(it => pickLi(it, D.sourceNames, `（<a href="../c/${it.code.toLowerCase()}.html#m${m}">${esc(cname(it.code))}</a>）`)).join("")}</ul></section>` : "";
  const regionHTML = D.regions.map(r => {
    const cs = Object.keys(byCountry).filter(code => D.countries[code].r === r.k);
    if (!cs.length) return "";
    return `<li class="tl-r"><h3 id="r-${r.k}">${esc(r.n)}</h3></li>${cs.map(code => `<li class="tl-c"><h4 id="c-${code.toLowerCase()}"><a href="../c/${code.toLowerCase()}.html#m${m}">${D.countries[code].f} ${esc(cname(code))}</a></h4><ul class="picks">${[...byCountry[code]].sort((a, b) => b.pop - a.pop).map(it => pickLi(it, D.sourceNames)).join("")}</ul></li>`).join("")}`;
  }).join("");
  const evs = D.evs.filter(e => !e.p).map(e => ({ ...e, span: span(e) })).filter(e => e.span?.months.has(m)).sort((a, b) => sortKey(a.span) - sortKey(b.span));
  const evHTML = `<ul class="evs">${evs.map(x => evLi(x, `（<a href="../c/${x.c.toLowerCase()}.html">${esc(cname(x.c))}</a>）`)).join("")}</ul>`;
  const faq = monthFAQ(D, m, all, evs);
  const faqHTML = `<section class="faq"><h2>${m} 月出國常見問題</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}</section>`;
  const body = `<p class="cta"><a href="../?m=${m}">在互動行事曆中查看 ${m} 月 →</a></p>
${monthNav("../", m)}
${topHTML}
<section><h2>各國 ${m} 月推薦</h2><nav class="toc" aria-label="跳到區域">${D.regions.filter(r => Object.keys(byCountry).some(code => D.countries[code].r === r.k)).map(r => `<a href="#r-${r.k}">${esc(r.n)}</a>`).join("")}</nav><ol class="tl">${regionHTML}</ol></section>
<section><h2>${YEAR} 年 ${m} 月各國節日與祭典</h2><p>日本各縣市祭典請看<a href="../c/jp.html">日本頁面</a>或互動行事曆的日本專區。</p>${evHTML}</section>
${faqHTML}
${regionNav(D, "../")}`;
  return page({
    path: `m/${m}.html`, en: `en/m/${m}.html`,
    title: `${m} 月出國去哪玩？各國 ${m} 月推薦景點與節慶｜${SITE_NAME}`,
    desc, h1: `${m} 月出國去哪玩？`,
    lead: `${Object.keys(byCountry).length} 國 ${m} 月的推薦景點與行程，依熱門程度 1～3 顆星排列，附資料來源；下方另有 ${m} 月各國節日與祭典。`,
    crumbs: [[SITE_NAME, ""], [`${m} 月推薦`, `m/${m}.html`]],
    body,
    ld: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  });
}

// ---------- 隱私權政策（AdSense 申請與聯盟行銷需要） ----------
function privacyPage() {
  const ads = SITE_CONFIG.adsense;
  const body = `<section><h2>本站蒐集的資料</h2>
<p>本站是靜態網站，沒有會員、表單或留言功能，不會要求你提供姓名、電子郵件等個人資料，也沒有自己的伺服器記錄你的瀏覽行為。</p>
<p>網站會在你的瀏覽器（localStorage）記住你選的類型篩選，這些資料只存在你的裝置上，不會傳給任何人；清除瀏覽器資料即可刪除。</p></section>
<section><h2>網站託管</h2><p>本站由 GitHub Pages 託管。GitHub 為了提供服務與維護安全，可能會記錄造訪者的 IP 位址等連線資料，詳見 <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" rel="noopener" target="_blank">GitHub 隱私權聲明</a>。主頁使用 Google Fonts 載入字型，Google 會收到你的 IP 位址，詳見 <a href="https://policies.google.com/privacy" rel="noopener" target="_blank">Google 隱私權政策</a>。</p></section>
<section><h2>廣告與 Cookie</h2>
<p>${ads ? "本站使用 Google AdSense 顯示廣告。" : "本站未來可能使用 Google AdSense 顯示廣告。"}Google 等第三方廣告供應商會使用 Cookie，依據你先前造訪本站或其他網站的紀錄放送廣告。Google 使用廣告 Cookie，讓它和合作夥伴能依你造訪本站及網路上其他網站的情形放送廣告。</p>
<p>你可以到 <a href="https://adssettings.google.com/" rel="noopener" target="_blank">Google 廣告設定</a> 停用個人化廣告，或到 <a href="https://www.aboutads.info/" rel="noopener" target="_blank">aboutads.info</a> 停用第三方廣告供應商的個人化廣告 Cookie。Google 如何使用這些資料，請見 <a href="https://policies.google.com/technologies/partner-sites" rel="noopener" target="_blank">Google 如何使用合作夥伴網站的資訊</a>。</p></section>
<section><h2>流量分析</h2><p>${SITE_CONFIG.ga ? "本站使用 Google Analytics 統計造訪人數與熱門頁面，" : "本站未來可能使用 Google Analytics 統計造訪人數與熱門頁面，"}Google 會透過 Cookie 收集匿名的瀏覽資料（例如瀏覽的頁面、裝置類型、大約所在地區），不包含你的姓名或聯絡方式。你可以安裝 <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener" target="_blank">Google Analytics 停用瀏覽器外掛程式</a> 拒絕被統計。</p></section>
<section><h2>聯盟行銷連結</h2><p>${AFFILIATE_NOTE}點擊這類連結後，旅遊平台可能在你的瀏覽器設定 Cookie，用來記錄訂單來自本站，適用該平台自己的隱私權政策。</p></section>
<section><h2>外部連結</h2><p>推薦項目附的資料來源連到旅行社、觀光局等外部網站，這些網站的內容與隱私權做法由各網站負責。</p></section>
<section><h2>政策更新與聯絡</h2><p>本政策若有修改會更新在這一頁。${SITE_CONFIG.reportEndpoint ? `透過「回報錯誤或建議」送出的內容（以及你選填的電子郵件）會經由 Cloudflare 轉存到本站的 Notion 資料庫，只用來修正資料與回覆你。` : ""}對本站或本政策有疑問，請寫信到 <a href="mailto:${SITE_CONFIG.contact}">${SITE_CONFIG.contact}</a>，或到<a href="contact.html">聯絡我們</a>頁面查看其他聯絡方式。</p></section>`;
  return page({
    path: "privacy.html", title: `隱私權政策｜${SITE_NAME}`,
    desc: `${SITE_NAME}的隱私權政策：本站蒐集哪些資料、廣告與 Cookie、聯盟行銷連結的說明。`,
    h1: "隱私權政策", lead: "最後更新：2026 年 11 月。", crumbs: [[SITE_NAME, ""], ["隱私權政策", "privacy.html"]], body,
  });
}

// ---------- 關於本站、聯絡我們（AdSense 審核要求公開透明的頁面） ----------
const MAIL = SITE_CONFIG.contact;
const mailLink = () => `<a href="mailto:${MAIL}">${MAIL}</a>`;
function siteStats(D) {
  const nC = Object.keys(D.countries).length;
  const nEv = D.evs.length;
  const nWh = Object.values(D.countries).reduce((n, c) => n + (c.wh?.length || 0), 0);
  return { nC, nEv, nWh };
}
function contactWays(zh) {
  const L = zh
    ? [SITE_CONFIG.reportEndpoint && `<li><b>回報資料錯誤或建議</b>：每一頁最下方都有「📮 回報錯誤或建議」按鈕，填寫後會直接送到站長的待辦清單，通常一週內處理。</li>`,
       MAIL && `<li><b>電子郵件</b>：${mailLink()}，回報錯誤、建議新增的國家或活動、合作洽詢都可以寄到這裡，通常一週內回覆。</li>`,
       SUPPORT_URL && `<li><b>Ko-fi</b>：在 <a href="${SUPPORT_URL}" rel="noopener" target="_blank">Ko-fi 頁面</a> 留言或私訊，合作、媒體採訪等事項也可以從這裡聯絡。</li>`]
    : [SITE_CONFIG.reportEndpoint && `<li><b>Report a data error</b>: use the "📮 Report a problem" button at the bottom of every page. Reports go straight to the maintainer's to-do list and are usually handled within a week.</li>`,
       MAIL && `<li><b>Email</b>: ${mailLink()} for data errors, suggestions and partnership enquiries. We usually reply within a week.</li>`,
       SUPPORT_URL && `<li><b>Ko-fi</b>: leave a message on <a href="${SUPPORT_URL}" rel="noopener" target="_blank">Ko-fi</a>; partnership and press enquiries are welcome there too.</li>`];
  return `<ul>${L.filter(Boolean).join("")}</ul>`;
}
function aboutPage(D) {
  const { nC, nEv, nWh } = siteStats(D);
  const body = `<section><h2>這個網站在做什麼</h2>
<p>${SITE_NAME}是一個免費的出國旅遊月曆，把 ${nC} 個國家的國定假日、祭典活動、體育賽事與最佳旅遊季節排進同一個月曆，讓你一眼看出「這個月去哪裡剛好有慶典」「哪幾天當地放假會人擠人」。</p>
<p>每個國家另外整理了熱門景點、自然景色、世界遺產與全年都能參加的在地體驗；日本細分到 47 個都道府縣。每個月還有依台灣旅行社行程熱門程度標星的推薦，適合排旅行時參考。</p></section>
<section><h2>資料從哪裡來</h2>
<ul><li><b>國定假日</b>：各國政府公告的官方假日，彙整自開源的 <a href="https://pypi.org/project/holidays/" rel="noopener" target="_blank">holidays</a> 資料集，再人工翻譯並合併連假。</li>
<li><b>祭典與活動</b>：各國觀光局、主辦單位官網與賽事官方網站；目前收錄約 ${nEv} 筆。</li>
<li><b>世界遺產</b>：聯合國教科文組織（UNESCO）世界遺產名錄，共 ${nWh} 處。</li>
<li><b>每月推薦</b>：台灣各大旅行社的出團行程與旅遊平台的推薦文章，每筆都附來源連結。</li></ul></section>
<section><h2>怎麼維護</h2>
<p>農曆、伊斯蘭曆或主辦單位每年公布的日期，會先依往年推估並標「約」。網站每個月固定檢查一次，官方公布正式日期後就更新；不是每年舉辦的活動（例如奧運、世界盃）另外追蹤下一屆。發現錯誤歡迎到<a href="contact.html">聯絡我們</a>告訴我。</p>
</section>
<section><h2>誰在做</h2>
<p>本站由一位喜歡出國旅行的個人開發者製作與維護，起因是每次排假都要在好幾個網站之間查各國節日。網站沒有接受任何旅行社或觀光局的付費置入，推薦的星等只依行程與文章的數量和熱門程度判斷。網站靠廣告與讀者在 Ko-fi 的贊助支撐營運。</p></section>`;
  return page({
    path: "about.html", en: "en/about.html", title: `關於本站｜${SITE_NAME}`,
    desc: `${SITE_NAME}是什麼、資料從哪裡來、多久更新一次，以及誰在維護這個免費的出國旅遊月曆。`,
    h1: "關於本站", lead: `一個月曆看 ${nC} 國的節日、祭典與旅遊季節。`, crumbs: [[SITE_NAME, ""], ["關於本站", "about.html"]], body,
  });
}
function contactPage() {
  const body = `<section><h2>聯絡方式</h2>${contactWays(true)}</section>
<section><h2>常見的聯絡事項</h2>
<ul><li><b>日期錯了或活動取消了</b>：請附上官方公告的網址，確認後會盡快更新。</li>
<li><b>想新增國家、祭典或體驗</b>：歡迎提供活動名稱、舉辦地點、大約日期與官網。</li>
<li><b>旅行社、觀光單位合作</b>：本站不收費刊登，但歡迎提供正確的活動資訊與官方來源。</li></ul>
<p>資料與廣告、Cookie 的使用方式請見<a href="privacy.html">隱私權政策</a>。</p></section>`;
  return page({
    path: "contact.html", en: "en/contact.html", title: `聯絡我們｜${SITE_NAME}`,
    desc: `回報${SITE_NAME}的資料錯誤、建議新增的國家或活動，或洽詢合作的聯絡方式。`,
    h1: "聯絡我們", lead: "發現資料有誤、想新增活動，或有任何建議，都歡迎告訴我。", crumbs: [[SITE_NAME, ""], ["聯絡我們", "contact.html"]], body,
  });
}
function aboutPageEn(D) {
  const { nC, nEv, nWh } = siteStats(D);
  const body = `<section><h2>What this site does</h2>
<p>${SITE_NAME_EN} is a free travel calendar that puts the public holidays, festivals, sports events and best travel seasons of ${nC} countries on one calendar, so you can see at a glance where there is a festival this month and which days will be crowded because of local holidays.</p>
<p>Each country also lists top sights, nature, World Heritage sites and local experiences you can do all year round, with Japan broken down into its 47 prefectures.</p></section>
<section><h2>Where the data comes from</h2>
<ul><li><b>Public holidays</b>: official government calendars, compiled from the open-source <a href="https://pypi.org/project/holidays/" rel="noopener" target="_blank">holidays</a> dataset and checked by hand.</li>
<li><b>Festivals and events</b>: national tourism boards, organisers and official event sites; about ${nEv} entries so far.</li>
<li><b>World Heritage</b>: the UNESCO World Heritage List, ${nWh} sites.</li>
<li><b>Monthly picks</b> (Chinese edition): Taiwanese tour operators' departures and travel platforms, each with a source link.</li></ul></section>
<section><h2>How it is kept up to date</h2>
<p>Dates that follow the lunar or Islamic calendar, or that organisers announce each year, are first estimated from past years and marked "approx.". The site is checked every month and updated once official dates are out; events that are not held every year, such as the Olympics, are tracked separately.</p></section>
<section><h2>Who makes it</h2>
<p>The site is built and maintained by an independent developer who loves travelling. It takes no paid placements from tour operators or tourism boards and is supported by ads and reader donations on Ko-fi. The English edition is translated from the original Chinese edition.</p></section>`;
  return pageEn({
    path: "en/about.html", zh: "about.html", title: `About | ${SITE_NAME_EN}`,
    desc: `What ${SITE_NAME_EN} is, where its holiday and festival data comes from, how often it is updated and who maintains it.`,
    h1: "About", lead: `Holidays, festivals and travel seasons for ${nC} countries on one calendar.`, crumbs: [[SITE_NAME_EN, "en/"], ["About", "en/about.html"]], body,
  });
}
function contactPageEn() {
  const body = `<section><h2>How to reach us</h2>${contactWays(false)}</section>
<section><h2>Common requests</h2>
<ul><li><b>A date is wrong or an event was cancelled</b>: please include a link to the official announcement.</li>
<li><b>Add a country, festival or experience</b>: send the name, place, approximate dates and official website.</li>
<li><b>Tour operators and tourism boards</b>: listings are free; accurate information and official sources are always welcome.</li></ul></section>`;
  return pageEn({
    path: "en/contact.html", zh: "contact.html", title: `Contact | ${SITE_NAME_EN}`,
    desc: `Report a data error, suggest a country or event to add, or get in touch with ${SITE_NAME_EN}.`,
    h1: "Contact", lead: "Found a mistake or want something added? Let me know.", crumbs: [[SITE_NAME_EN, "en/"], ["Contact", "en/contact.html"]], body,
  });
}

// 日本各縣的全年體驗（國家頁用）
function prefEx(D, code, lang) {
  if (code !== "JP") return "";
  const ps = D.japan.prefectures.filter(p => p.ex?.length);
  if (!ps.length) return "";
  const zh = lang === "zh";
  return `<section><h2>${zh ? "日本各縣全年體驗" : "Experiences by prefecture"}</h2>${ps.map(p => `<p><b>${esc(p.n)}</b> ${p.ex.map(esc).join(zh ? "、" : ", ")}</p>`).join("")}</section>`;
}

// ---------- 英文版（en/）：資料用 data/i18n/en.json 翻譯；每月推薦是依台灣旅行社整理，只在中文頁提供 ----------
const SITE_NAME_EN = "World Festival Calendar";
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EN_MON = EN_MONTHS.map(m => m.slice(0, 3));
const TYPE_EN = { H: "Public holiday", F: "Festival", G: "Sports", S: "Season" };
const WN_EN = { "文": "cultural", "自": "natural", "複": "mixed" };
const fitEn = (head, items, max = 155) => { const out = []; for (const it of items) { if ((head + [...out, it].join(", ") + ".").length > max) break; out.push(it); } return head + (out.length ? out.join(", ") + "." : ""); };
const fmtSpanEn = x => {
  const f = ([m, d]) => `${EN_MON[m - 1]} ${d}`;
  const t = x.s[0] === x.e[0] && x.s[1] === x.e[1] ? f(x.s) : x.s[0] === x.e[0] ? `${f(x.s)}–${x.e[1]}` : `${f(x.s)}–${f(x.e)}`;
  return x.y === YEAR ? t : `${t} (${x.y})`;
};

// 把資料換成英文；回傳新的 D（不改動原本的中文資料）
function englishData(D) {
  const EN = JSON.parse(readFileSync(join(root, "data", "i18n", "en.json"), "utf8"));
  const tr = s => (s && EN[s]) || s;
  const E = structuredClone(D);
  E.regions.forEach(r => { r.n = tr(r.n); });
  for (const c of Object.values(E.countries)) { c.n = tr(c.n); c.s = c.s.map(tr); c.nat = (c.nat || []).map(tr); c.ex = (c.ex || []).map(tr); c.wh = (c.wh || []).map(([n, k]) => [tr(n), k]); }
  E.evs.forEach(e => { e.n = tr(e.n); e.x = tr(e.x); });
  E.japan.areas.forEach(a => { a.n = tr(a.n); });
  E.japan.prefectures.forEach(p => { p.n = tr(p.n); p.ex = (p.ex || []).map(tr); });
  for (const k of Object.keys(E.prefName)) E.prefName[k] = tr(E.prefName[k]);
  E.future.forEach(f => { f.n = tr(f.n); f.x = tr(f.x); });
  E.whNote = Object.fromEntries(Object.entries(read("countries.json").whNote).map(([k, v]) => [k, tr(v)]));
  return E;
}

const supportHTMLEn = (up = "") => (SUPPORT_URL ? `<div class="support"><p>This calendar is free to use. If it helped you plan a trip, you can buy me a coffee to keep the data up to date.</p><a class="kofi" href="${SUPPORT_URL}" target="_blank" rel="noopener">☕ Buy me a coffee on Ko-fi</a></div>` : "")
  + `<p class="legal">${SITE_CONFIG.reportEndpoint ? `<button type="button" class="report" data-report="${SITE_CONFIG.reportEndpoint}">📮 Report a problem</button>　` : ""}<a href="${up}en/about.html">About</a>　<a href="${up}en/contact.html">Contact</a>　<a href="${up}privacy.html" hreflang="zh-Hant">Privacy policy (Chinese)</a></p>`
  + (SITE_CONFIG.reportEndpoint ? `<script src="${up}js/report.js" defer></script>` : "");

function pageEn({ path, zh, title, desc, h1, lead, crumbs, body, ld }) {
  const url = SITE + path;
  const up = "../".repeat(path.split("/").length - 1);
  const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + p })) };
  const lds = [breadcrumb, ...(ld ? [ld] : [])].map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${cspFor(PAGE_CSP)}">${[gaScript(up), adsenseScript()].filter(Boolean).map(x => "\n" + x).join("")}
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
${hreflang(zh, path)}
<meta name="theme-color" content="#0e5a76">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE_NAME_EN}">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${up}favicon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="${up}favicon-192.png">
<link rel="stylesheet" href="${up}css/page.css">
<script src="${up}js/page.js" defer></script>
${lds}
</head>
<body>
<div class="wrap" id="top">
<p class="lang"><a href="${up}${zh}" hreflang="zh-Hant" lang="zh-Hant">中文</a></p><nav class="crumb" aria-label="Breadcrumb">${crumbs.map(([n, p], i) => i === crumbs.length - 1 ? `<span aria-current="page">${esc(n)}</span>` : `<a href="${up}${p}">${esc(n)}</a>`).join(" › ")}</nav>
<header>
<h1>${esc(h1)}</h1>
<p class="lead">${esc(lead)}</p>
</header>
<main>
${body}
</main>
<footer>
${supportHTMLEn(up)}
<p>Dates marked "approx." are estimates based on past years or on the lunar or Islamic calendar; check with the organisers for the year's official dates.</p>
<p><a href="${up}en/">Back to ${SITE_NAME_EN}</a></p>
</footer>
</div>
</body>
</html>
`;
}

const evLiEn = (x, extra = "") => `<li><span class="dt">${fmtSpanEn(x.span)}${x.a ? " (approx.)" : ""}</span> <span class="t ${x.t}">${TYPE_EN[x.t]}</span> <b>${esc(x.n)}</b>${extra}: ${esc(x.x)}${evSrc(x, "Sources: ", ", ")}</li>`;
const monthNavEn = (up, current) => `<nav class="months" aria-label="Months">${MONTHS.map(m => m === current ? `<span>${EN_MON[m - 1]}</span>` : `<a href="${up}en/m/${m}.html">${EN_MON[m - 1]}</a>`).join(" ")}</nav>`;
function regionNavEn(E, up, current) {
  return `<nav class="all" aria-labelledby="all-h"><h2 id="all-h">Countries</h2>${E.regions.map(r => {
    const cs = Object.entries(E.countries).filter(([, c]) => c.r === r.k);
    return `<p><b>${esc(r.n)}</b> ${cs.map(([k, c]) => k === current ? `<span>${esc(c.n)}</span>` : `<a href="${up}en/c/${k.toLowerCase()}.html">${esc(c.n)}</a>`).join(" ")}</p>`;
  }).join("")}</nav>`;
}
const withSpan = (E, pred) => E.evs.filter(pred).map(e => ({ ...e, span: span(e) })).filter(e => e.span).sort((a, b) => sortKey(a.span) - sortKey(b.span));

function countryPageEn(E, code) {
  const c = E.countries[code], lc = code.toLowerCase();
  const rn = E.regions.find(r => r.k === c.r).n;
  const evs = withSpan(E, e => e.c === code);
  const pref = x => x.p ? ` (${esc(E.prefName[x.p])})` : "";
  const byMonth = MONTHS.map(m => {
    const xs = evs.filter(x => x.span.s[0] === m);
    return xs.length ? `<li class="tl-c"><h3 id="m${m}">${EN_MONTHS[m - 1]}</h3><ul class="evs">${xs.map(x => evLiEn(x, pref(x))).join("")}</ul></li>` : "";
  }).join("");
  const big = evs.filter(x => x.t === "F" || x.t === "G").map(x => x.n);
  const desc = fitEn(`${c.n} festivals, public holidays and best time to visit, month by month, with top sights and World Heritage. Highlights: `, big);
  const list = (h, xs) => xs?.length ? `<section><h2>${h}</h2><ul class="tags">${xs.map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>` : "";
  const wh = c.wh.length ? `<section><h2>World Heritage sites</h2><ul class="tags">${c.wh.map(([n, k]) => `<li>${esc(n)}<small> (${WN_EN[k]})</small></li>`).join("")}</ul></section>` : (E.whNote[code] ? `<section><h2>World Heritage sites</h2><p>${esc(E.whNote[code])}</p></section>` : "");
  const fut = E.future.filter(f => f.c === code).sort((a, b) => a.year - b.year);
  const when = f => f.d ? `${f.year}: ${f.d.split("~").map(x => { const [m, d] = x.split("-").map(Number); return `${EN_MON[m - 1]} ${d}`; }).join("–")}${f.a ? " (provisional)" : ""}` : `${f.year} (dates TBA)`;
  const futHTML = fut.length ? `<section><h2>Coming up in future years</h2><ul class="evs">${fut.map(f => `<li><span class="dt">${when(f)}</span> <span class="t ${f.t}">${TYPE_EN[f.t]}</span> <b>${esc(f.n)}</b>: ${esc(f.x)}</li>`).join("")}</ul></section>` : "";
  const prefs = code === "JP" ? `<section><h2>Japan's 47 prefectures</h2>${E.japan.areas.map(a => `<p><b>${esc(a.n)}</b> ${E.japan.prefectures.filter(p => p.a === a.k).map(p => esc(p.n)).join(", ")}</p>`).join("")}<p>For each prefecture's sights, historic sites and festivals, see the <a href="../?c=JP">Japan section of the interactive calendar</a>.</p></section>` : "";
  const body = `<p class="cta"><a href="../?c=${code}">Open ${esc(c.n)} in the interactive calendar →</a></p>
${monthNavEn("../../")}
<section><h2>${esc(c.n)} events by month (${YEAR})</h2>${byMonth ? `<ol class="tl">${byMonth}</ol>` : "<p>No events listed yet.</p>"}</section>
${futHTML}
${list("Top sights", c.s)}${list("Nature", c.nat)}${list("Experiences all year round", c.ex)}${prefEx(E, code, "en")}${wh}${prefs}
<p>Month-by-month trip picks rated by Taiwanese tour operators are available on the <a href="../../c/${lc}.html" hreflang="zh-Hant">Chinese version of this page</a>.</p>
${regionNavEn(E, "../../", code)}`;
  return pageEn({
    path: `en/c/${lc}.html`, zh: `c/${lc}.html`,
    title: `${c.n} Travel Calendar: Festivals, Holidays & When to Go | ${SITE_NAME_EN}`,
    desc, h1: `${c.f} ${c.n} travel calendar`,
    lead: `${rn} · ${c.n}: public holidays, festivals, sports events and travel seasons for every month of ${YEAR}, plus top sights, nature and World Heritage sites.`,
    crumbs: [[SITE_NAME_EN, "en/"], [c.n, `en/c/${lc}.html`]],
    body,
    ld: { "@context": "https://schema.org", "@type": "TouristDestination", name: c.n, description: desc, url: SITE + `en/c/${lc}.html`, includesAttraction: c.s.slice(0, 20).map(n => ({ "@type": "TouristAttraction", name: n })) },
  });
}

function monthFAQEn(E, m, evs) {
  const M = EN_MONTHS[m - 1], cn = x => E.countries[x.c].n;
  const out = [];
  const fest = evs.filter(x => x.t === "F" || x.t === "G");
  if (fest.length) out.push([`What are the big festivals and events in ${M}?`,
    `Highlights in ${M} ${YEAR} include ${fest.slice(0, 12).map(x => `${x.n} (${cn(x)}, ${fmtSpanEn(x.span)})`).join("; ")}${fest.length > 12 ? `, among ${fest.length} events listed on this page` : ""}.`]);
  const hol = evs.filter(x => x.t === "H");
  if (hol.length) out.push([`Which countries have public holidays in ${M} ${YEAR}?`,
    `There are ${hol.length} public holidays or long weekends, including ${hol.slice(0, 12).map(x => `${x.n} in ${cn(x)} (${fmtSpanEn(x.span)})`).join("; ")}${hol.length > 12 ? " and more" : ""}. Sights and transport get busier and some shops close, so check before you book.`]);
  const sea = evs.filter(x => x.t === "S");
  if (sea.length) out.push([`Where is in season in ${M}?`, `Good-season picks for ${M} include ${sea.slice(0, 10).map(x => `${x.n} (${cn(x)})`).join(", ")}.`]);
  out.push(["How accurate are the dates?", `Fixed-date holidays come from official calendars. Dates marked "approx." follow past years or the lunar or Islamic calendar and are checked monthly as organisers announce them.`]);
  return out;
}

function monthPageEn(E, m) {
  const M = EN_MONTHS[m - 1];
  const evs = withSpan(E, e => !e.p && span(e)?.months.has(m));
  const pref = x => x.p ? ` (${esc(E.prefName[x.p])})` : "";
  const regionHTML = E.regions.map(r => {
    const cs = Object.keys(E.countries).filter(code => E.countries[code].r === r.k && evs.some(x => x.c === code));
    if (!cs.length) return "";
    return `<li class="tl-r"><h3 id="r-${r.k}">${esc(r.n)}</h3></li>${cs.map(code => `<li class="tl-c"><h4 id="c-${code.toLowerCase()}"><a href="../c/${code.toLowerCase()}.html#m${m}">${E.countries[code].f} ${esc(E.countries[code].n)}</a></h4><ul class="evs">${evs.filter(x => x.c === code).map(x => evLiEn(x, pref(x))).join("")}</ul></li>`).join("")}`;
  }).join("");
  const nC = new Set(evs.map(x => x.c)).size;
  const desc = fitEn(`${M} festivals, public holidays and travel seasons in ${nC} countries. Highlights: `, evs.filter(x => x.t === "F" || x.t === "G").map(x => x.n));
  const faq = monthFAQEn(E, m, evs);
  const body = `<p class="cta"><a href="../?m=${m}">Open ${M} in the interactive calendar →</a></p>
${monthNavEn("../../", m)}
<section><h2>Events in ${M} ${YEAR} by country</h2><nav class="toc" aria-label="Jump to region">${E.regions.filter(r => Object.keys(E.countries).some(code => E.countries[code].r === r.k && evs.some(x => x.c === code))).map(r => `<a href="#r-${r.k}">${esc(r.n)}</a>`).join("")}</nav><ol class="tl">${regionHTML}</ol></section>
<section class="faq"><h2>${M} travel FAQ</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}</section>
<p>Trip picks for ${M}, rated by Taiwanese tour operators, are on the <a href="../../m/${m}.html" hreflang="zh-Hant">Chinese version of this page</a>. Japan's prefecture festivals are on the <a href="../c/jp.html">Japan page</a>.</p>
${regionNavEn(E, "../../")}`;
  return pageEn({
    path: `en/m/${m}.html`, zh: `m/${m}.html`,
    title: `Where to Travel in ${M}: Festivals & Events Worldwide | ${SITE_NAME_EN}`,
    desc, h1: `Where to go in ${M}`,
    lead: `Public holidays, festivals, sports events and travel seasons in ${M} ${YEAR} across ${nC} countries, grouped by region.`,
    crumbs: [[SITE_NAME_EN, "en/"], [M, `en/m/${m}.html`]],
    body,
    ld: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  });
}

function indexLinksEn(E) {
  return `<nav class="seo-links" aria-labelledby="seo-h">
    <h2 id="seo-h">Months and countries</h2>
    <p>${MONTHS.map(m => `<a href="m/${m}.html">${EN_MONTHS[m - 1]}</a>`).join(" ")}</p>
${E.regions.map(r => `    <p><b>${esc(r.n)}</b> ${Object.entries(E.countries).filter(([, c]) => c.r === r.k).map(([k, c]) => `<a href="c/${k.toLowerCase()}.html">${esc(c.n)}</a>`).join(" ")}</p>`).join("\n")}
  </nav>`;
}

// 由中文主頁產生 en/index.html：換成英文文字、資源路徑加上 ../，資料路徑由 data-base 指回根目錄
function englishIndex(zhIndex, E, nC) {
  const R = [
    ['<html lang="zh-Hant-TW">', '<html lang="en" data-base="../">'],
    [/<title>[^<]*<\/title>/, `<title>World Festival Calendar: Holidays, Festivals & Events in ${nC} Countries</title>`],
    [/<meta name="description" content="[^"]*">/, `<meta name="description" content="A month-by-month calendar of holidays, festivals, sports events and the best time to visit in ${nC} countries, with a world map and World Heritage sites.">`],
    [/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${SITE}en/">\n${hreflang("", "en/")}`],
    ['<meta property="og:site_name" content="環球節慶行事曆">', `<meta property="og:site_name" content="${SITE_NAME_EN}">`],
    ['<meta property="og:locale" content="zh_TW">', '<meta property="og:locale" content="en_US">'],
    [/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="World Festival Calendar: Holidays, Festivals & Events in ${nC} Countries">`],
    [/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="Public holidays, festivals, sports events and travel seasons in ${nC} countries, month by month.">`],
    [`<meta property="og:url" content="${SITE}">`, `<meta property="og:url" content="${SITE}en/">`],
    [/<script type="application\/ld\+json">[^<]*<\/script>/, `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: SITE_NAME_EN, url: SITE + "en/", inLanguage: "en" }, { "@type": "WebApplication", name: SITE_NAME_EN, url: SITE + "en/", applicationCategory: "TravelApplication", operatingSystem: "Any", inLanguage: "en", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }] })}</script>`],
    ['href="favicon.svg"', 'href="../favicon.svg"'], ['href="favicon-192.png" sizes', 'href="../favicon-192.png" sizes'], ['<link rel="apple-touch-icon" href="favicon-192.png">', '<link rel="apple-touch-icon" href="../favicon-192.png">'],
    ['href="css/style.css"', 'href="../css/style.css"'], ['src="vendor/d3.min.js"', 'src="../vendor/d3.min.js"'], ['src="vendor/topojson.min.js"', 'src="../vendor/topojson.min.js"'], ['src="js/app.js"', 'src="../js/app.js"'],
    ['href="privacy.html"', 'href="../privacy.html" hreflang="zh-Hant"'],
    ['<h1>環球節慶行事曆</h1>', `<h1>World Festival Calendar</h1>`],
    ['<a class="lang" href="en/" hreflang="en" lang="en">English</a>', '<a class="lang" href="../" hreflang="zh-Hant" lang="zh-Hant">中文</a>'],
    [/<p class="sub" id="sub">[^<]*<\/p>/, `<p class="sub" id="sub">Public holidays, festivals, sports events and the best time to visit around the world. Click a country on the map or a region below to filter.</p>`],
    ['aria-label="圖例"', 'aria-label="Legend"'],
    [/<i class="sw H"><\/i>國定假日/g, '<i class="sw H"></i>Public holiday'], [/<i class="sw F"><\/i>祭典活動/g, '<i class="sw F"></i>Festival'], [/<i class="sw G"><\/i>體育賽事/g, '<i class="sw G"></i>Sports'], [/<i class="sw S"><\/i>旅遊季節/g, '<i class="sw S"></i>Season'],
    ['aria-label="世界地圖，依區域上色"', 'aria-label="World map coloured by region"'], ['aria-label="放大"', 'aria-label="Zoom in"'], ['aria-label="縮小"', 'aria-label="Zoom out"'], ['aria-label="顯示全世界"', 'aria-label="Show the whole world"'],
    ['深色＝本月有活動　拖曳可移動地圖，Ctrl＋滾輪縮放', 'Darker = events this month · Drag to pan, Ctrl + scroll to zoom'],
    ['aria-label="區域篩選"', 'aria-label="Region filter"'], ['aria-label="國家篩選"', 'aria-label="Country filter"'],
    ['aria-label="上個月"', 'aria-label="Previous month"'], ['aria-label="下個月"', 'aria-label="Next month"'], ['aria-label="年份"', 'aria-label="Year"'],
    ['placeholder="搜尋節慶或國家"', 'placeholder="Search events or countries"'], ['aria-label="月曆"', 'aria-label="Calendar"'],
    ['<div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div>', '<div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>'],
    ['<h2 id="jp-h">日本 47 都道府縣</h2>', '<h2 id="jp-h">Japan\'s 47 prefectures</h2>'],
    ['每個縣市的知名景點、遺跡史蹟、世界遺產與祭典活動。點地圖或縣名查看，祭典日期會同步排進上方月曆。', 'Top sights, historic sites, World Heritage and festivals in every prefecture. Click the map or a name; festival dates also appear in the calendar above.'],
    ['aria-label="地方篩選"', 'aria-label="Region filter"'], ['aria-label="顯示方式"', 'aria-label="View"'],
    ['>地圖</button>', '>Map</button>'], ['>全部縣市一覽</button>', '>All prefectures</button>'],
    ['placeholder="在一覽中搜尋景點、遺跡、祭典"', 'placeholder="Search sights, historic sites, festivals"'], ['>複製為 Markdown</button>', '>Copy as Markdown</button>'],
    ['aria-label="Markdown 內容"', 'aria-label="Markdown"'], ['aria-label="日本都道府縣地圖，依八大地方上色"', 'aria-label="Map of Japan\'s prefectures coloured by region"'],
    [/(<!-- seo:links -->)[\s\S]*?(<!-- \/seo:links -->)/, `$1\n  ${indexLinksEn(E)}\n  $2`],
    [/(<!-- support -->)[\s\S]*?(<!-- \/support -->)/, `$1${supportHTMLEn("../")}$2`],
    [/<p>標「約」的日期[^<]*<\/p>/, '<p>Dates marked "approx." are estimates based on past years or on the lunar or Islamic calendar; Islamic holidays can shift by a day depending on the moon sighting, and local festivals follow each organiser\'s announcement.</p>'],
    [/<p>區域劃分參考[^<]*<\/p>/, '<p>Regions follow the UN geoscheme: Central Europe covers Germany, Austria, Switzerland, Czechia, Slovakia, Hungary and Poland; Eastern Europe covers Russia, Ukraine, Belarus, Romania, Bulgaria and the Baltic states; the Balkans are in Southern Europe.</p>'],
    [/<p>世界遺產依[^<]*<\/p>/, '<p>World Heritage sites follow the UNESCO World Heritage List (as of the 47th session, 2025); large countries show selected sites only. The official list prevails.</p>'],
    [/<p>資料來源：[^<]*<\/p>/, '<p>Sources include official government holiday calendars, national tourism boards and festival organisers, the UNESCO World Heritage List and more. Translated from the Chinese edition.</p>'],
  ];
  let s = zhIndex;
  for (const [a, b] of R) {
    const hit = typeof a === "string" ? s.includes(a) : a.test(s);
    if (!hit) throw new Error(`en/index.html 轉換找不到：${a}`);
    s = s.replace(a, b);
  }
  return s.replace(/src="js\//g, 'src="../js/');
}

// ---------- 主頁的連結清單與 sitemap ----------
function indexLinks(D) {
  return `<nav class="seo-links" aria-labelledby="seo-h">
    <h2 id="seo-h">每月推薦與各國頁面</h2>
    <p>${MONTHS.map(m => `<a href="m/${m}.html">${m} 月出國推薦</a>`).join(" ")}</p>
${D.regions.map(r => `    <p><b>${esc(r.n)}</b> ${Object.entries(D.countries).filter(([, c]) => c.r === r.k).map(([k, c]) => `<a href="c/${k.toLowerCase()}.html">${esc(c.n)}</a>`).join(" ")}</p>`).join("\n")}
  </nav>`;
}
const sitemap = paths => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map(p => `  <url><loc>${SITE}${p}</loc></url>`).join("\n")}
</urlset>
`;

// 產生全部檔案，回傳 {相對路徑: 內容}；index.html 只替換標記之間的內容
export function build() {
  const D = loadAll();
  const files = {};
  for (const code of Object.keys(D.countries)) files[`c/${code.toLowerCase()}.html`] = countryPage(D, code);
  for (const m of MONTHS) files[`m/${m}.html`] = monthPage(D, m);
  files["privacy.html"] = privacyPage();
  files["about.html"] = aboutPage(D);
  files["contact.html"] = contactPage();
  const E = englishData(D);
  for (const code of Object.keys(D.countries)) files[`en/c/${code.toLowerCase()}.html`] = countryPageEn(E, code);
  for (const m of MONTHS) files[`en/m/${m}.html`] = monthPageEn(E, m);
  files["en/about.html"] = aboutPageEn(D);
  files["en/contact.html"] = contactPageEn();
  files["sitemap.xml"] = sitemap(["", ...MONTHS.map(m => `m/${m}.html`), ...Object.keys(D.countries).map(k => `c/${k.toLowerCase()}.html`), "privacy.html", "about.html", "contact.html",
    "en/", "en/about.html", "en/contact.html", ...MONTHS.map(m => `en/m/${m}.html`), ...Object.keys(D.countries).map(k => `en/c/${k.toLowerCase()}.html`)]);
  const index = readFileSync(join(root, "index.html"), "utf8");
  const re = /(<!-- seo:links -->)[\s\S]*?(<!-- \/seo:links -->)/;
  if (!re.test(index)) throw new Error("index.html 缺少 <!-- seo:links --> 標記");
  const reS = /(<!-- support -->)[\s\S]*?(<!-- \/support -->)/;
  if (!reS.test(index)) throw new Error("index.html 缺少 <!-- support --> 標記");
  // 標題與說明裡的國家數跟著資料更新
  const nC = Object.keys(D.countries).length;
  files["index.html"] = index.replace(re, `$1\n  ${indexLinks(D)}\n  $2`).replace(reS, `$1${supportHTML()}$2`)
    .replace(/<head>[\s\S]*?<\/head>/, h => h.replace(/\d+ 國/g, `${nC} 國`))
    .replace(/(<link rel="canonical" href="[^"]*">)(\n<link rel="alternate"[^\n]*){0,3}/, `$1\n${hreflang("", "en/")}`)
    .replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)/, (_, a, csp, b) => a + cspFor(csp) + b)
    .replace(/(<!-- ads:head -->)[\s\S]*?(<!-- \/ads:head -->)/, `$1${gaScript()}${adsenseScript()}$2`);
  files["en/index.html"] = englishIndex(files["index.html"], E, nC);
  return files;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const files = build();
  rmSync(join(root, "c"), { recursive: true, force: true });
  rmSync(join(root, "m"), { recursive: true, force: true });
  rmSync(join(root, "en"), { recursive: true, force: true });
  for (const d of ["c", "m", "en", "en/c", "en/m"]) mkdirSync(join(root, d));
  for (const [p, s] of Object.entries(files)) writeFileSync(join(root, p), s);
  console.log(`已產生 ${Object.keys(files).length} 個檔案`);
}
