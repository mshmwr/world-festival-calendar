// ---------- 共用元件 ----------
// 篩選按鈕列：第一顆是「全部」，items 為 {v, label, dot, n, title}
function chipRow(attr, current, allLabel, items){
  const chip = (v, on, body, title) => `<button class="chip" data-${attr}="${v}" aria-pressed="${on}"${title ? ` title="${title}"` : ""}>${body}</button>`;
  return chip("", !current, allLabel) + items.map(it => chip(it.v, current === it.v,
    `${it.dot ? `<i class="dot" style="background:var(--r-${it.dot})"></i>` : ""}${it.label}${it.n != null ? `<span class="n">${it.n}</span>` : ""}`, it.title)).join("");
}
// 分頁列：tabs 為 [key, 標籤, 計數函式]，其餘參數傳給計數函式
function tabBar(attr, current, tabs, ...args){
  return `<div class="tabs" role="tablist">${tabs.map(([k, label, n]) => `<button role="tab" data-${attr}="${k}" aria-selected="${current === k}">${label}<span>${n(...args)}</span></button>`).join("")}</div>`;
}
// 景點方塊清單
function tagList(items, cls = "", render = s => s){
  return `<ul class="sights${cls ? " " + cls : ""}">${items.map(s => `<li>${render(s)}</li>`).join("")}</ul>`;
}
// 節慶清單，清單為空時顯示提示；opts 傳給 itemHTML
function eventList(xs, empty, ...opts){
  return `<ul class="list">${xs.map(x => itemHTML(x, ...opts)).join("") || `<li class="empty">${empty}</li>`}</ul>`;
}
// 國家／縣市卡片標題
function entityHead({flag, name, color, sub, btnId, btnLabel}){
  return `<div class="country-head">${flag ? `<span class="fl">${flag}</span>` : ""}<div><h3>${name}</h3>
      <span class="rg" style="font-size:12.5px;color:var(--muted)"><i style="background:var(--r-${color})"></i>${sub}</span></div>
      <button class="x" id="${btnId}">${btnLabel}</button></div>`;
}
// 地圖提示框：填入內容並保持在地圖卡片範圍內
function placeTip(tipEl, card, ev, html){
  const r = card.getBoundingClientRect();
  tipEl.innerHTML = html; tipEl.hidden = false;
  let x = ev.clientX - r.left + 12, y = ev.clientY - r.top + 12;
  if (x + tipEl.offsetWidth > r.width - 8) x = ev.clientX - r.left - tipEl.offsetWidth - 12;
  if (y + tipEl.offsetHeight > r.height - 8) y = ev.clientY - r.top - tipEl.offsetHeight - 12;
  tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
}
function onClicks(root, sel, fn){ root.querySelectorAll(sel).forEach(b => b.onclick = () => fn(b)); }
// 符合目前類型篩選、且落在目前月份的活動數
const monthCount = pred => ALL.filter(x => pred(x) && inMonth(x) && st.types[x.t]).length;
