// 國家頁與月份頁的閱讀進度：固定在右側的時間軸，由內文的 ol.tl 產生。
// 大項目（區域；國家頁沒有區域時就是各月份）是方形節點，小項目（國家）是圓點。
// 展開狀態：點大項目展開或收起底下的小項目，點小項目跳到該段。
// 折疊狀態（窄螢幕預設，或按 » 收起）：向右收成細欄，只列大項目的節點與名稱，點名稱直接跳到該段；按 « 展開。
// 線從頂端畫到目前閱讀位置，經過的節點填色，目前所在的節點加光圈。
const tl = document.querySelector("main ol.tl");
if (tl) {
  const REF = 64; // 標題捲到畫面頂端往下這個位置以內，就算「正在讀」這段（跳轉時標題停在 44px）
  const items = [...tl.children].map(li => {
    const h = li.querySelector("h3, h4");
    return { li, h, region: li.classList.contains("tl-r"), text: h.textContent.trim(), id: h.id };
  });
  let region = null;
  for (const it of items) { if (it.region) region = it; else it.parent = region; }
  items.forEach(it => { it.major = it.region || !it.parent; it.kids = items.filter(x => x.parent === it).length; });
  const title = tl.closest("section")?.querySelector("h2")?.textContent.trim() || document.querySelector("h1").textContent.trim();

  const nav = document.createElement("nav");
  const EN = document.documentElement.lang.startsWith("en");
  // 收合時欄寬有限：中文去掉「・」，英文把方位詞縮寫（Northeast Asia → NE Asia）
  const ABBR = { Northeast: "NE", Southeast: "SE", Western: "W.", Central: "C.", Eastern: "E.", Southern: "S.", Northern: "N.",  Middle: "Mid." };
  const short = t => EN ? ({ "North America": "N. Amer.", "Latin America": "Lat. Amer." })[t] || t.replace(/^(\w+) (?=\w)/, (m, w) => ABBR[w] ? ABBR[w] + " " : m) : t.replace(/・/g, "");
  nav.className = "sidetl"; nav.setAttribute("aria-label", EN ? "Reading progress" : "閱讀進度");
  nav.innerHTML = `<p class="st-h"><button type="button" class="st-fold"></button><span></span><b></b></p><ol>${items.map((it, i) =>
    `<li class="${it.major ? "r" : "c"}${it.kids ? " kids" : ""}" data-i="${i}"><a href="#${it.id}"${it.kids ? ' aria-expanded="false"' : ""}>${
      it.major && short(it.text) !== it.text ? `<span class="lb">${it.text}</span><span class="sh" aria-hidden="true">${short(it.text)}</span>` : it.text}</a></li>`).join("")}</ol>`;
  document.body.append(nav);
  document.body.classList.add("has-sidetl");
  const opened = new Set();               // 已展開的大項目
  const narrow = matchMedia("(max-width:1300px)");
  const foldBtn = nav.querySelector(".st-fold");
  const setFolded = f => {
    nav.classList.toggle("folded", f);
    foldBtn.textContent = f ? "«" : "»";
    foldBtn.setAttribute("aria-label", f ? (EN ? "Expand timeline" : "展開時間軸") : (EN ? "Collapse timeline" : "向右收起時間軸"));
    foldBtn.hidden = !narrow.matches && !f; // 寬螢幕空間夠，不必收起
    update();
  };
  foldBtn.addEventListener("click", () => setFolded(!nav.classList.contains("folded")));
  narrow.addEventListener("change", () => setFolded(narrow.matches));
  nav.addEventListener("click", e => {
    const a = e.target.closest("li a"); if (!a) return;
    const li = a.parentElement, it = items[+li.dataset.i];
    if (nav.classList.contains("folded")) return;           // 折疊時直接跳轉
    if (it.kids) {                                          // 展開時：點大項目展開／收起小項目
      e.preventDefault();
      opened.has(it) ? opened.delete(it) : opened.add(it);
      update();
    } else if (narrow.matches) setFolded(true);             // 窄螢幕跳到小項目後收回細欄
  });
  nav.querySelector(".st-h span").textContent = title;
  const ol = nav.querySelector("ol"), lis = [...ol.children], pct = nav.querySelector(".st-h b");

  let ticking = false;
  function update() {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = Math.round((max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 1) * 100);
    // 目前所在的項目：標題已捲到 REF 以上的最後一個
    const tops = items.map(it => it.h.getBoundingClientRect().top);
    let cur = -1; tops.forEach((t, i) => { if (t <= REF) cur = i; });
    const curRegion = cur < 0 ? null : items[cur].region ? items[cur] : items[cur].parent;
    lis.forEach((li, i) => {
      const it = items[i];
      li.hidden = !it.major && !opened.has(it.parent);
      if (it.kids) li.firstChild.setAttribute("aria-expanded", opened.has(it));
      li.classList.toggle("past", i < cur);
      li.classList.toggle("now", i === cur);
      li.classList.toggle("in", it === curRegion);
    });
    // 線：畫到目前節點，再依段落內的閱讀比例往下一個看得到的節點延伸
    // 收合時國家節點不顯示，以畫面上看得到的節點為準
    let fill = 0;
    const shown = li => li.offsetParent !== null;
    const at = cur < 0 ? -1 : lis.slice(0, cur + 1).findLastIndex(shown);
    if (at >= 0) {
      const dot = li => li.offsetTop + li.offsetHeight / 2;
      const nextI = lis.findIndex((li, i) => i > at && shown(li));
      fill = dot(lis[at]);
      const nextTop = nextI > 0 ? tops[nextI] : tl.getBoundingClientRect().bottom;
      const frac = Math.min(1, Math.max(0, (REF - tops[at]) / Math.max(1, nextTop - tops[at])));
      fill += ((nextI > 0 ? dot(lis[nextI]) : ol.offsetHeight) - fill) * frac;
    }
    ol.style.setProperty("--fill", `${fill}px`);
    pct.textContent = `${p}%`;
    // 目前節點保持在側欄可見範圍內
    const now = lis[at];
    if (now && (now.offsetTop < ol.scrollTop || now.offsetTop > ol.scrollTop + ol.clientHeight - 30)) ol.scrollTop = now.offsetTop - ol.clientHeight / 3;
  }
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update);
  setFolded(narrow.matches);
}
