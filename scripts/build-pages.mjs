// 產生給搜尋引擎讀的靜態頁面：每國一頁（c/<代碼>.html）、每月一頁（m/<月>.html）、sitemap.xml，
// 並更新 index.html 裡 <!-- seo:links --> 標記之間的連結清單。
// 主頁的內容是 JavaScript 畫出來的，這些頁面讓內容在不執行 JavaScript 時也讀得到。
// 用法：node scripts/build-pages.mjs        改過 data/ 之後執行，再 commit 產生的檔案
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export const SITE = "https://mshmwr.github.io/world-festival-calendar/";
export const SITE_NAME = "環球節慶行事曆";
// 贊助、廣告、聯盟行銷的設定在 js/site-config.js
import { SITE_CONFIG, HAS_AFFILIATE, AFFILIATE_NOTE, affLink, withAds, adsenseScript } from "../js/site-config.js";
export const SUPPORT_URL = SITE_CONFIG.support;
const supportHTML = (up = "") => (SUPPORT_URL ? `<div class="support"><p>這個行事曆免費使用。如果它幫你排好了旅行，歡迎請我喝杯咖啡，支持資料持續更新。</p><a class="kofi" href="${SUPPORT_URL}" target="_blank" rel="noopener">☕ 在 Ko-fi 請我喝杯咖啡</a></div>` : "")
  + `<p class="legal">${HAS_AFFILIATE ? AFFILIATE_NOTE + " " : ""}<a href="${up}privacy.html">隱私權政策</a></p>`;
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
function page({ path, title, desc, h1, lead, crumbs, body, ld }) {
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
<meta http-equiv="Content-Security-Policy" content="${withAds(PAGE_CSP)}">${adsenseScript() ? "\n" + adsenseScript() : ""}
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
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
<nav class="crumb" aria-label="導覽路徑">${crumbs.map(([n, p], i) => i === crumbs.length - 1 ? `<span aria-current="page">${esc(n)}</span>` : `<a href="${up}${p}">${esc(n)}</a>`).join(" › ")}</nav>
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
const evLi = (x, extra = "") => `<li><span class="dt">${fmtSpan(x.span)}${x.a ? "（約）" : ""}</span> <span class="t ${x.t}">${TYPE_N[x.t]}</span> <b>${esc(x.n)}</b>${extra}：${esc(x.x)}</li>`;

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
${list("熱門景點", c.s)}${list("自然景色", c.nat)}${wh}${prefs}
${regionNav(D, "../", code)}`;
  return page({
    path: `c/${code.toLowerCase()}.html`,
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
    path: `m/${m}.html`,
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
<section><h2>聯盟行銷連結</h2><p>${AFFILIATE_NOTE}點擊這類連結後，旅遊平台可能在你的瀏覽器設定 Cookie，用來記錄訂單來自本站，適用該平台自己的隱私權政策。</p></section>
<section><h2>外部連結</h2><p>推薦項目附的資料來源連到旅行社、觀光局等外部網站，這些網站的內容與隱私權做法由各網站負責。</p></section>
<section><h2>政策更新與聯絡</h2><p>本政策若有修改會更新在這一頁。對本站或本政策有疑問，可以在 <a href="https://github.com/mshmwr/world-festival-calendar/issues" rel="noopener" target="_blank">GitHub</a> 留言${SUPPORT_URL ? `，或透過 <a href="${SUPPORT_URL}" rel="noopener" target="_blank">Ko-fi</a> 聯絡` : ""}。</p></section>`;
  return page({
    path: "privacy.html", title: `隱私權政策｜${SITE_NAME}`,
    desc: `${SITE_NAME}的隱私權政策：本站蒐集哪些資料、廣告與 Cookie、聯盟行銷連結的說明。`,
    h1: "隱私權政策", lead: "最後更新：2026 年 11 月。", crumbs: [[SITE_NAME, ""], ["隱私權政策", "privacy.html"]], body,
  });
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
  files["sitemap.xml"] = sitemap(["", ...MONTHS.map(m => `m/${m}.html`), ...Object.keys(D.countries).map(k => `c/${k.toLowerCase()}.html`), "privacy.html"]);
  const index = readFileSync(join(root, "index.html"), "utf8");
  const re = /(<!-- seo:links -->)[\s\S]*?(<!-- \/seo:links -->)/;
  if (!re.test(index)) throw new Error("index.html 缺少 <!-- seo:links --> 標記");
  const reS = /(<!-- support -->)[\s\S]*?(<!-- \/support -->)/;
  if (!reS.test(index)) throw new Error("index.html 缺少 <!-- support --> 標記");
  // 標題與說明裡的國家數跟著資料更新
  const nC = Object.keys(D.countries).length;
  files["index.html"] = index.replace(re, `$1\n  ${indexLinks(D)}\n  $2`).replace(reS, `$1${supportHTML()}$2`)
    .replace(/<head>[\s\S]*?<\/head>/, h => h.replace(/\d+ 國/g, `${nC} 國`))
    .replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)/, (_, a, csp, b) => a + withAds(csp) + b)
    .replace(/(<!-- ads:head -->)[\s\S]*?(<!-- \/ads:head -->)/, `$1${adsenseScript()}$2`);
  return files;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const files = build();
  rmSync(join(root, "c"), { recursive: true, force: true });
  rmSync(join(root, "m"), { recursive: true, force: true });
  mkdirSync(join(root, "c")); mkdirSync(join(root, "m"));
  for (const [p, s] of Object.entries(files)) writeFileSync(join(root, p), s);
  console.log(`已產生 ${Object.keys(files).length} 個檔案`);
}
