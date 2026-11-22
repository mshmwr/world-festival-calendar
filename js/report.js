// 「回報錯誤或建議」表單：點頁尾按鈕開啟對話框，送到 site-config 設定的後台（worker/report.js），由後台寫進 Notion。
(() => {
  const btns = document.querySelectorAll("[data-report]");
  if (!btns.length) return;
  const TYPES = ["日期錯誤", "資料錯誤", "建議新增活動或國家", "網站問題", "其他"];
  const dlg = document.createElement("dialog");
  dlg.className = "report-dlg";
  dlg.setAttribute("aria-labelledby", "rp-h");
  dlg.innerHTML = `<form method="dialog" novalidate>
    <h2 id="rp-h">回報錯誤或建議</h2>
    <p class="rp-note">日期錯了、資料有誤、想加哪個活動或國家，都可以告訴我。</p>
    <label>類型<select name="type">${TYPES.map(t => `<option>${t}</option>`).join("")}</select></label>
    <label>國家或活動<input name="place" maxlength="100" placeholder="例如：日本・札幌雪祭"></label>
    <label>內容<span class="req">必填</span><textarea name="content" maxlength="2000" rows="5" required placeholder="哪裡有問題、正確的資訊是什麼"></textarea></label>
    <label>來源網址<input name="source" type="url" maxlength="500" placeholder="https://（選填，有官方來源更好）"></label>
    <label>電子郵件<input name="email" type="email" maxlength="200" placeholder="需要回覆時再填（選填）"></label>
    <label class="hp" aria-hidden="true">網站<input name="website" tabindex="-1" autocomplete="off"></label>
    <p class="rp-msg" role="status"></p>
    <div class="rp-btns"><button type="button" class="rp-cancel">取消</button><button type="submit" class="rp-send">送出</button></div>
  </form>`;
  document.body.append(dlg);
  const f = dlg.querySelector("form"), msg = dlg.querySelector(".rp-msg"), send = dlg.querySelector(".rp-send");
  let endpoint = "";
  const guessPlace = () => {
    const sel = document.querySelector("#side .country-head h3, .country-head h3");
    if (sel) return sel.textContent.trim();
    const h1 = document.querySelector("main ~ * h1, header h1, h1");
    return document.querySelector("link[rel=canonical]")?.href.includes("/c/") && h1 ? h1.textContent.replace(/旅遊行事曆.*$/, "").replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim() : "";
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
    if (f.content.value.trim().length < 5) { msg.textContent = "請寫下要回報的內容（至少 5 個字）"; msg.className = "rp-msg err"; f.content.focus(); return; }
    send.disabled = true; msg.textContent = "送出中…"; msg.className = "rp-msg";
    const body = Object.fromEntries(["type", "place", "content", "source", "email", "website"].map(k => [k, f[k].value]));
    body.page = location.href;
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "送出失敗");
      msg.textContent = "已收到，謝謝你的回報！"; msg.className = "rp-msg ok"; send.hidden = true;
    } catch (err) {
      msg.textContent = `${err.message}，請稍後再試。`; msg.className = "rp-msg err"; send.disabled = false;
    }
  });
})();
