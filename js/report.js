// 「回報錯誤或建議」表單：點頁尾按鈕開啟對話框，送到 site-config 設定的後台（worker/report.js），由後台寫進 Notion。
(() => {
  const btns = document.querySelectorAll("[data-report]");
  if (!btns.length) return;
  const TYPES = ["日期錯誤", "資料錯誤", "建議新增活動或國家", "網站問題", "其他"]; // 送到後台的值固定用中文
  const EN = document.documentElement.lang.startsWith("en");
  const L = EN ? {
    types: ["Wrong date", "Wrong information", "Suggest an event or country", "Website problem", "Other"],
    h: "Report a problem or suggestion", note: "Wrong date, incorrect details, or an event or country you'd like added? Let us know.",
    type: "Type", place: "Country or event", placeH: "e.g. Japan · Sapporo Snow Festival", content: "Details", req: "required",
    contentH: "What's wrong, and what's the correct information?", source: "Source URL", sourceH: "https:// (optional, official sources help)",
    email: "Email", emailH: "Only if you'd like a reply (optional)", site: "Website", cancel: "Cancel", send: "Send",
    short: "Please describe the issue (at least 5 characters).", sending: "Sending…", ok: "Thanks, we got your report!", fail: "Couldn't send", retry: "please try again later.",
  } : {
    types: TYPES, h: "回報錯誤或建議", note: "日期錯了、資料有誤、想加哪個活動或國家，都可以告訴我。",
    type: "類型", place: "國家或活動", placeH: "例如：日本・札幌雪祭", content: "內容", req: "必填",
    contentH: "哪裡有問題、正確的資訊是什麼", source: "來源網址", sourceH: "https://（選填，有官方來源更好）",
    email: "電子郵件", emailH: "需要回覆時再填（選填）", site: "網站", cancel: "取消", send: "送出",
    short: "請寫下要回報的內容（至少 5 個字）", sending: "送出中…", ok: "已收到，謝謝你的回報！", fail: "送出失敗", retry: "請稍後再試。",
  };
  const dlg = document.createElement("dialog");
  dlg.className = "report-dlg";
  dlg.setAttribute("aria-labelledby", "rp-h");
  dlg.innerHTML = `<form method="dialog" novalidate>
    <h2 id="rp-h">${L.h}</h2>
    <p class="rp-note">${L.note}</p>
    <label>${L.type}<select name="type">${TYPES.map((t, i) => `<option value="${t}">${L.types[i]}</option>`).join("")}</select></label>
    <label>${L.place}<input name="place" maxlength="100" placeholder="${L.placeH}"></label>
    <label>${L.content}<span class="req">${L.req}</span><textarea name="content" maxlength="2000" rows="5" required placeholder="${L.contentH}"></textarea></label>
    <label>${L.source}<input name="source" type="url" maxlength="500" placeholder="${L.sourceH}"></label>
    <label>${L.email}<input name="email" type="email" maxlength="200" placeholder="${L.emailH}"></label>
    <label class="hp" aria-hidden="true">${L.site}<input name="website" tabindex="-1" autocomplete="off"></label>
    <p class="rp-msg" role="status"></p>
    <div class="rp-btns"><button type="button" class="rp-cancel">${L.cancel}</button><button type="submit" class="rp-send">${L.send}</button></div>
  </form>`;
  document.body.append(dlg);
  const f = dlg.querySelector("form"), msg = dlg.querySelector(".rp-msg"), send = dlg.querySelector(".rp-send");
  let endpoint = "";
  const guessPlace = () => {
    const sel = document.querySelector("#side .country-head h3, .country-head h3");
    if (sel) return sel.textContent.trim();
    const h1 = document.querySelector("main ~ * h1, header h1, h1");
    return document.querySelector("link[rel=canonical]")?.href.includes("/c/") && h1 ? h1.textContent.replace(/旅遊行事曆.*$| travel calendar.*$/i, "").replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim() : "";
  };
  btns.forEach(b => b.addEventListener("click", e => {
    e.preventDefault();
    endpoint = b.dataset.report;
    f.reset(); msg.textContent = ""; msg.className = "rp-msg"; send.disabled = false; send.hidden = false;
    f.place.value = guessPlace();
    dlg.showModal();
    f.content.focus();
  }));
  dlg.querySelector(".rp-cancel").addEventListener("click", () => dlg.close());
  f.addEventListener("submit", async e => {
    e.preventDefault();
    if (f.content.value.trim().length < 5) { msg.textContent = L.short; msg.className = "rp-msg err"; f.content.focus(); return; }
    send.disabled = true; msg.textContent = L.sending; msg.className = "rp-msg";
    const body = Object.fromEntries(["type", "place", "content", "source", "email", "website"].map(k => [k, f[k].value]));
    body.page = location.href;
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(EN ? L.fail : (j.error || L.fail));
      msg.textContent = L.ok; msg.className = "rp-msg ok"; send.hidden = true;
    } catch (err) {
      msg.textContent = EN ? `${err.message}; ${L.retry}` : `${err.message}，${L.retry}`; msg.className = "rp-msg err"; send.disabled = false;
    }
  });
})();
