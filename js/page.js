// 國家頁與月份頁的閱讀進度：頂端進度條 + 目前所在段落（例如「各國 1 月推薦 › 東南亞 › 泰國」）
const bar = document.querySelector(".readbar");
if (bar) {
  const fill = bar.querySelector(".fill"), where = bar.querySelector(".where");
  const heads = [...document.querySelectorAll("main h2, main h3, main h4")];
  const level = h => +h.tagName[1];
  let ticking = false;
  function update() {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    const pct = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 1;
    fill.style.transform = `scaleX(${pct})`;
    // 找出已捲過頂端的最後一個 h2，以及它之後的 h3、h4，組成路徑
    const trail = [];
    for (const h of heads) {
      if (h.getBoundingClientRect().top > 70) break;
      trail.length = Math.min(trail.length, level(h) - 2);
      trail[level(h) - 2] = h.textContent.trim();
    }
    where.textContent = `${trail.filter(Boolean).join(" › ") || document.querySelector("h1").textContent.trim()}・${Math.round(pct * 100)}%`;
    bar.setAttribute("aria-valuenow", Math.round(pct * 100));
  }
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update);
  bar.hidden = false;
  update();
}
