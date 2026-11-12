// 產生社群分享圖 og.png（1200×630）：node scripts/make-og.mjs（需要 Playwright）
import { chromium } from "playwright";
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box;
font-family:"Noto Sans TC","PingFang TC","WenQuanYi Zen Hei",sans-serif;color:#fff;
background:radial-gradient(circle at 85% 20%,#2a9d8f 0,transparent 45%),radial-gradient(circle at 10% 90%,#c8553d 0,transparent 40%),#0e5a76}
.e{font-size:96px;line-height:1}.t{font-size:92px;font-weight:900;margin:24px 0 18px;letter-spacing:4px}
.s{font-size:38px;opacity:.92;line-height:1.5}.u{position:absolute;bottom:44px;left:90px;font-size:26px;opacity:.75}
</style></head><body><div class="e">📅🌏</div><div class="t">環球節慶行事曆</div>
<div class="s">61 國節日・祭典・旅遊季節<br>每月出國推薦，依旅行社熱門程度標星</div>
<div class="u">mshmwr.github.io/world-festival-calendar</div></body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html);
await p.screenshot({ path: new URL("../og.png", import.meta.url).pathname });
await b.close();
console.log("已產生 og.png");
