// 國家頁與月份頁的閱讀進度：固定在右側的時間軸（寬螢幕），窄螢幕改成右下角的小標籤。
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
  const pill = document.createElement("a");
  pill.className = "readpill"; pill.href = "#top";
  document.body.append(nav, pill);
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
    });
    // 線：畫到目前節點，再依段落內的閱讀比例往下一個看得到的節點延伸
    let fill = 0;
    if (cur >= 0) {
      const dot = li => li.offsetTop + li.offsetHeight / 2;
      fill = dot(lis[cur]);
      const next = lis.slice(cur + 1).find(li => !li.hidden);
      const nextTop = items[cur + 1] ? tops[cur + 1] : tl.getBoundingClientRect().bottom;
      const frac = Math.min(1, Math.max(0, (REF - tops[cur]) / Math.max(1, nextTop - tops[cur])));
      fill += ((next ? dot(next) : ol.offsetHeight) - fill) * frac;
    }
    ol.style.setProperty("--fill", `${fill}px`);
    pct.textContent = `${p}%`;
    const trail = cur < 0 ? title : [curRegion && curRegion !== items[cur] ? curRegion.text : null, items[cur].text].filter(Boolean).join(" › ");
    pill.textContent = `${trail}・${p}%`;
    // 目前節點保持在側欄可見範圍內
    const now = lis[cur];
    if (now && (now.offsetTop < ol.scrollTop || now.offsetTop > ol.scrollTop + ol.clientHeight - 30)) ol.scrollTop = now.offsetTop - ol.clientHeight / 3;
  }
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update);
  update();
}
