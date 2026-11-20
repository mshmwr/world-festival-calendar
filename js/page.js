// 國家頁與月份頁的閱讀進度：固定在右側的時間軸。寬螢幕直接顯示名稱；
// 窄螢幕收成右邊一條細軸，只畫大項目（區域，或國家頁的月份）的節點，點一下展開名稱。
// 時間軸由內文的 ol.tl 產生：區域是方形節點、國家或月份是圓點；只展開目前所在區域的國家；
// 線從頂端畫到目前閱讀位置，經過的節點填色，目前所在的節點加光圈，點節點可跳到該段。
const tl = document.querySelector("main ol.tl");
if (tl) {
  const REF = 64; // 標題捲到畫面頂端往下這個位置以內，就算「正在讀」這段（跳轉時標題停在 44px）
  const items = [...tl.children].map(li => {
    const h = li.querySelector("h3, h4"), a = h.querySelector("a");
    return { li, h, region: li.classList.contains("tl-r"), text: h.textContent.trim(), id: h.id };
  });
  let region = null;
  for (const it of items) { if (it.region) region = it; else it.parent = region; }
  const title = tl.closest("section")?.querySelector("h2")?.textContent.trim() || document.querySelector("h1").textContent.trim();

  const nav = document.createElement("nav");
  nav.className = "sidetl"; nav.setAttribute("aria-label", "閱讀進度");
  nav.innerHTML = `<p class="st-h"><span></span><b></b></p><ol>${items.map((it, i) =>
    `<li class="${it.region ? "r" : "c"}" data-i="${i}"><a href="#${it.id}">${it.text}</a></li>`).join("")}</ol>`;
  document.body.append(nav);
  document.body.classList.add("has-sidetl");
  // 窄螢幕：收合時點時間軸展開；展開後點節點跳轉並收合，點其他地方也收合
  nav.addEventListener("click", e => {
    if (getComputedStyle(nav).getPropertyValue("--compact").trim() !== "1") return;
    if (!nav.classList.contains("open")) { e.preventDefault(); nav.classList.add("open"); update(); }
    else if (e.target.closest("a")) nav.classList.remove("open");
  });
  document.addEventListener("click", e => { if (!nav.contains(e.target) && nav.classList.contains("open")) { nav.classList.remove("open"); update(); } });
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
      li.hidden = !it.region && it.parent && it.parent !== curRegion;
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
  update();
}
