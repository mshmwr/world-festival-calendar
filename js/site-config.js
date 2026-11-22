// 網站營運設定：贊助、Google AdSense、聯盟行銷。瀏覽器（js/components.js）和 scripts/build-pages.mjs 共用。
// 改完執行 npm run build，再 commit 推送。
export const SITE_CONFIG = {
  // 贊助按鈕連結；空白就不顯示
  support: "https://ko-fi.com/mshmwr",
  // 「回報錯誤或建議」表單的後台網址（Cloudflare Worker，程式在 worker/report.js）；空白就不顯示回報按鈕
  reportEndpoint: "",
  // Google AdSense 發布商 ID，例如 "ca-pub-1234567890123456"；空白就不載入廣告。
  // 填好後還要把 ads.txt 放到 https://mshmwr.github.io/ads.txt（或自訂網域的根目錄）。
  adsense: "",
  // 聯盟行銷：網域 → 追蹤參數名稱與你的聯盟 ID。填了 id 的網域，推薦來源連結會自動加上追蹤參數並標示為贊助連結。
  affiliate: {
    "kkday.com": { param: "cid", id: "" },
    "klook.com": { param: "aid", id: "" },
  },
};

const AFF = Object.entries(SITE_CONFIG.affiliate).filter(([, a]) => a.id);
export const HAS_AFFILIATE = AFF.length > 0;

// 回傳 { href, sponsored }：符合聯盟網域時加上追蹤參數
export function affLink(url) {
  let u;
  try { u = new URL(url); } catch { return { href: url, sponsored: false }; }
  const host = u.hostname.replace(/^www\./, "");
  const hit = AFF.find(([d]) => host === d || host.endsWith("." + d));
  if (!hit) return { href: url, sponsored: false };
  u.searchParams.set(hit[1].param, hit[1].id);
  return { href: u.toString(), sponsored: true };
}

export const AFFILIATE_NOTE = "部分行程連結為聯盟行銷連結，透過連結預訂時本站可能獲得佣金，不會影響你的價格，也不影響推薦星等。";

// 啟用 AdSense 時需要加進內容安全政策（CSP）的來源
export const ADS_CSP = {
  "script-src": ["https://pagead2.googlesyndication.com", "https://*.googlesyndication.com", "https://*.google.com", "https://*.doubleclick.net", "https://*.gstatic.com", "https://www.googletagservices.com", "https://adservice.google.com"],
  "frame-src": ["https://*.doubleclick.net", "https://*.googlesyndication.com", "https://*.google.com"],
  "img-src": ["https:"],
  "connect-src": ["https://*.google.com", "https://*.doubleclick.net", "https://*.googlesyndication.com", "https://*.gstatic.com"],
  "style-src": ["'unsafe-inline'"],
};
// 在 CSP 字串上加入（或移除）廣告來源；重複執行結果相同
export function withAds(csp, on = !!SITE_CONFIG.adsense) {
  const dirs = csp.split(";").map(s => s.trim()).filter(Boolean).map(s => s.split(/\s+/));
  const all = new Set(Object.values(ADS_CSP).flat().filter(x => x !== "'unsafe-inline'"));
  for (const d of dirs) d.splice(1, d.length, ...d.slice(1).filter(v => !all.has(v)));
  if (on) for (const [k, vs] of Object.entries(ADS_CSP)) {
    let d = dirs.find(x => x[0] === k);
    if (!d) { d = [k, ...(k === "frame-src" ? [] : ["'self'"])]; dirs.splice(dirs.findIndex(x => x[0] === "object-src"), 0, d); }
    for (const v of vs) if (!d.includes(v)) d.push(v);
  }
  return dirs.filter(d => d.length > 1).map(d => d.join(" ")).join("; ");
}
// 網站的 CSP：依設定加入廣告來源與回報後台網址。connect-src 每次重建，換網址也不會留下舊的
export function cspFor(csp) {
  const base = withAds(csp, false).split("; ").filter(d => !d.startsWith("connect-src"));
  const extra = SITE_CONFIG.reportEndpoint ? [new URL(SITE_CONFIG.reportEndpoint).origin] : [];
  const i = base.findIndex(d => d.startsWith("object-src"));
  base.splice(i < 0 ? base.length : i, 0, ["connect-src", "'self'", ...extra].join(" "));
  return withAds(base.join("; "));
}
export const adsenseScript = () => SITE_CONFIG.adsense
  ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(SITE_CONFIG.adsense)}" crossorigin="anonymous"></script>` : "";
