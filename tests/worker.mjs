// 回報後台（worker/report.js）的單元測試：不連網，用假的 fetch 檢查送到 Notion 的內容
import worker, { validate, notionPage } from "../worker/report.js";
let failed = 0;
const check = (name, ok) => { if (!ok) { failed++; console.log(`FAIL ${name}`); } };
const ORIGIN = "https://mshmwr.github.io";
const env = { NOTION_TOKEN: "secret-test", NOTION_DATA_SOURCE_ID: "ds-123" };
const calls = [];
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response("{}", { status: 200 }); };
const post = (body, origin = ORIGIN) => worker.fetch(new Request("https://w.example/", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }), env);

check("內容太短會被擋", !validate({ content: "abc" }).ok);
check("來源網址必須是 http(s)", !validate({ content: "日期錯了喔喔", source: "javascript:alert(1)" }).ok);
check("電子郵件格式", !validate({ content: "日期錯了喔喔", email: "nope" }).ok);
check("未知類型改成其他", validate({ content: "日期錯了喔喔", type: "亂填" }).data.type === "其他");
check("外站的頁面網址不記錄", validate({ content: "日期錯了喔喔", page: "https://evil.example/x" }).data.page === "");
const long = notionPage(validate({ content: "字".repeat(300) }).data, "ds");
check("標題截到 80 字、完整內容放詳細說明", long.properties["回報內容"].title[0].text.content.length === 80 && long.properties["詳細說明"].rich_text[0].text.content.length === 300);

let r = await post({ content: "札幌雪祭 2027 年日期是 2/4～2/11", type: "日期錯誤", place: "日本・札幌雪祭", source: "https://www.snowfes.com/", email: "a@b.co", page: ORIGIN + "/world-festival-calendar/c/jp.html" });
const sent = JSON.parse(calls[0]?.init.body || "{}");
check("正常回報寫進 Notion", r.status === 200 && calls.length === 1 && calls[0].url === "https://api.notion.com/v1/pages"
  && calls[0].init.headers.Authorization === "Bearer secret-test" && sent.parent.data_source_id === "ds-123"
  && sent.properties["類型"].select.name === "日期錯誤" && sent.properties["來源網址"].url === "https://www.snowfes.com/" && sent.properties["回報頁面"].url.endsWith("/c/jp.html"));
check("回應允許網站跨來源讀取", r.headers.get("Access-Control-Allow-Origin") === ORIGIN);
calls.length = 0;
r = await post({ content: "札幌雪祭日期錯了" }, "https://evil.example");
check("其他網站送來的被拒絕且不寫入", r.status === 403 && calls.length === 0);
r = await post({ content: "我是機器人填的", website: "spam" });
check("蜜罐欄位有值：假裝成功但不寫入", r.status === 200 && calls.length === 0);
r = await post("not json");
check("格式錯誤回 400", r.status === 400 && calls.length === 0);
r = await worker.fetch(new Request("https://w.example/", { method: "OPTIONS", headers: { Origin: ORIGIN } }), env);
check("預檢請求回 204", r.status === 204 && r.headers.get("Access-Control-Allow-Methods").includes("POST"));
globalThis.fetch = async () => new Response("{}", { status: 500 });
r = await post({ content: "Notion 掛掉的時候" });
check("Notion 失敗時回 502、不洩漏細節", r.status === 502 && !(await r.text()).includes("secret"));

// /stats：只回傳數字，查詢條件正確
let q = [];
globalThis.fetch = async (url, init) => { q.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ results: [{}, {}, {}], has_more: false }), { status: 200 }); };
r = await worker.fetch(new Request("https://w.example/stats"), env);
const st = await r.json();
check("統計網址只回傳筆數", r.status === 200 && st.new === 3 && st.pending === 3 && Object.keys(st).sort().join() === "new,ok,pending,since"
  && q.every(x => x.url === "https://api.notion.com/v1/data_sources/ds-123/query") && q.some(x => x.body.filter.created_time?.on_or_after) && q.some(x => x.body.filter.status?.equals === "待處理"));
if (failed) { console.log(`\n${failed} 項回報後台檢查未通過`); process.exit(1); }
console.log("PASS 回報後台：驗證、寫入 Notion、跨來源與防濫用");
