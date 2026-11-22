// 回報表單的後台（Cloudflare Worker）：收到網站送來的回報，檢查後直接寫進 Notion 資料庫。
// 這個程式本身不儲存任何資料；Notion 金鑰只存在 Worker 的密鑰設定（NOTION_TOKEN），不在網站或 repo 裡。
// GET /stats 只回傳筆數（過去 24 小時新增、待處理），給每日提醒排程使用，不含任何回報內容。
// 部署方式見 worker/README.md。
const ALLOWED_ORIGINS = ["https://mshmwr.github.io"];
export const TYPES = ["日期錯誤", "資料錯誤", "建議新增活動或國家", "網站問題", "其他"];
const NOTION_VERSION = "2025-09-03";

const clean = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "";
const isHttpUrl = v => { try { const u = new URL(v); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; } };
const text = s => s ? [{ type: "text", text: { content: s } }] : [];

// 檢查並整理送來的欄位；回傳 { ok, data } 或 { ok:false, error }
export function validate(b) {
  if (!b || typeof b !== "object") return { ok: false, error: "格式錯誤" };
  const content = clean(b.content, 2000);
  if (content.length < 5) return { ok: false, error: "請寫下要回報的內容（至少 5 個字）" };
  const type = TYPES.includes(b.type) ? b.type : "其他";
  const place = clean(b.place, 100);
  const source = clean(b.source, 500);
  if (source && !isHttpUrl(source)) return { ok: false, error: "來源網址格式不正確" };
  const email = clean(b.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "電子郵件格式不正確" };
  const page = clean(b.page, 500);
  return { ok: true, data: { content, type, place, source, email, page: ALLOWED_ORIGINS.some(o => page.startsWith(o + "/")) ? page : "" } };
}

// 轉成 Notion 建立頁面的內容
export function notionPage(d, dataSourceId) {
  const title = d.content.length > 80 ? d.content.slice(0, 79) + "…" : d.content;
  const props = {
    "回報內容": { title: text(title) },
    "類型": { select: { name: d.type } },
    "國家或活動": { rich_text: text(d.place) },
    "詳細說明": { rich_text: text(d.content) },
  };
  if (d.source) props["來源網址"] = { url: d.source };
  if (d.email) props["聯絡信箱（選填）"] = { email: d.email };
  if (d.page) props["回報頁面"] = { url: d.page };
  return { parent: { type: "data_source_id", data_source_id: dataSourceId }, properties: props };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const cors = { "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0], "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method === "GET" && new URL(req.url).pathname === "/stats") return stats(env, reply);
    if (req.method !== "POST") return reply(405, { ok: false, error: "只接受 POST" });
    if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { ok: false, error: "來源網站不允許" });
    if ((req.headers.get("Content-Length") | 0) > 10000) return reply(413, { ok: false, error: "內容太長" });
    let body;
    try { body = await req.json(); } catch { return reply(400, { ok: false, error: "格式錯誤" }); }
    if (body && body.website) return reply(200, { ok: true }); // 蜜罐欄位：機器人才會填，假裝成功
    const v = validate(body);
    if (!v.ok) return reply(400, v);
    const r = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
      body: JSON.stringify(notionPage(v.data, env.NOTION_DATA_SOURCE_ID)),
    });
    if (!r.ok) return reply(502, { ok: false, error: "暫時無法送出，請稍後再試" });
    return reply(200, { ok: true });
  },
};

// 每日提醒用的統計：只回傳數字
async function stats(env, reply) {
  const since = new Date(Date.now() - 864e5).toISOString();
  const count = async filter => {
    let n = 0, cursor;
    do {
      const r = await fetch(`https://api.notion.com/v1/data_sources/${env.NOTION_DATA_SOURCE_ID}/query`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
        body: JSON.stringify({ filter, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      n += j.results.length; cursor = j.has_more ? j.next_cursor : null;
    } while (cursor && n < 1000);
    return n;
  };
  try {
    const [newReports, pending] = await Promise.all([
      count({ timestamp: "created_time", created_time: { on_or_after: since } }),
      count({ property: "處理狀態", status: { equals: "待處理" } }),
    ]);
    return reply(200, { ok: true, since, new: newReports, pending });
  } catch { return reply(502, { ok: false, error: "暫時無法讀取 Notion" }); }
}
