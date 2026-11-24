// 介面文字的中英對照。語言由 <html lang> 決定：en 開頭為英文，其餘為中文。
// 資料本身（國家、活動等）的英文在 data/i18n/en.json，由 js/data.js 載入時套用。
export const LANG = typeof document !== "undefined" && document.documentElement.lang.startsWith("en") ? "en" : "zh";
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EN_MON = EN_MONTHS.map(m => m.slice(0, 3));
const EN_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// 每個 key 為 [中文, 英文]；字串或函式
const M = {
  sep: ["・", " · "], list: ["、", ", "], colon: ["：", ": "], approx: ["約", "approx."], approxParen: ["（約）", " (approx.)"],
  month: [m => `${m} 月`, m => EN_MONTHS[m - 1]],
  monthShort: [m => `${m} 月`, m => EN_MON[m - 1]],
  yearMonth: [(y, m) => `${y} 年 ${m} 月`, (y, m) => `${EN_MONTHS[m - 1]} ${y}`],
  year: [y => `${y} 年`, y => `${y}`],
  dayTitle: [(m, d, w) => `${m} 月 ${d} 日（${"日一二三四五六"[w]}）`, (m, d, w) => `${EN_DOW[w]}, ${EN_MON[m - 1]} ${d}`],
  dayAria: [(m, d) => `${m} 月 ${d} 日，在右側列出當天活動`, (m, d) => `${EN_MON[m - 1]} ${d}: list this day's events`],
  types: [{ H: "國定假日", F: "祭典活動", G: "體育賽事", S: "旅遊季節" }, { H: "Public holiday", F: "Festival", G: "Sports event", S: "Travel season" }],
  tabs: [{ ev: "節慶", s: "景點", nat: "自然景色", wh: "世界遺產" }, { ev: "Events", s: "Sights", nat: "Nature", wh: "World Heritage" }],
  ptabs: [{ s: "景點", h: "遺跡・史蹟", wh: "世界遺產", ev: "祭典活動" }, { s: "Sights", h: "Historic sites", wh: "World Heritage", ev: "Festivals" }],
  whKind: [{ "文": "文化", "自": "自然", "複": "複合" }, { "文": "Cultural", "自": "Natural", "複": "Mixed" }],
  mapTipCountry: [(m, n, wh) => `${m} 月 ${n} 項活動${wh ? `・世界遺產 ${wh} 處` : ""}・點擊查看`, (m, n, wh) => `${plural(n, "event")} in ${EN_MON[m - 1]}${wh ? ` · ${wh} World Heritage` : ""} · click to view`],
  allRegions: ["全部地區", "All regions"],
  regionTitle: [(r, n) => `${r}：收錄 ${n} 個國家`, (r, n) => `${r}: ${plural(n, "country").replace("countrys", "countries")}`],
  regionCountries: [r => `${r}的國家`, r => `Countries in ${r}`],
  countsHint: [m => `數字＝${m} 月活動數`, m => `numbers = events in ${EN_MON[m - 1]}`],
  allCountries: ["全部國家", "All countries"],
  countryTitle: [(c, m, n) => `${c}：${m} 月共 ${n} 項活動`, (c, m, n) => `${c}: ${plural(n, "event")} in ${EN_MON[m - 1]}`],
  collapse: ["收合", "Less"], moreN: [n => `＋${n} 項`, n => `+${n} more`],
  ongoingN: [n => `進行中 ${n}`, n => `${n} ongoing`],
  hideIntro: ["收合介紹", "Hide details"], showIntro: ["看介紹", "Show details"],
  nItems: [n => `${n} 項`, n => `${n}`],
  showAll: [n => `顯示全部 ${n} 項`, n => `Show all ${n}`],
  wholeMonth: ["看整個月", "Whole month"], clearDay: ["取消選取日期", "Clear date"],
  emptyDay: [s => `這天沒有符合篩選的節慶活動${s ? "，但適合前往下列地方" : ""}。`, s => `No events match your filters on this day${s ? ", but these places are in season" : ""}.`],
  startsToday: ["當天開始", "Starting this day"], ongoing: ["進行中", "Ongoing"], goodToVisit: ["適合前往", "In season"],
  monthPicks: [m => `${m} 月推薦`, m => `${EN_MON[m - 1]} picks`],
  allCountriesBtn: ["看全部國家", "All countries"],
  toJP: ["查看 47 都道府縣的景點、遺跡與祭典 ↓", "Explore Japan's 47 prefectures ↓"],
  picksLegend: [m => `熱門程度依台灣旅行社 ${m} 月行程與旅遊網站推薦整理，★★★ 為最熱門。`, m => `Popularity is based on Taiwanese tour operators' ${EN_MONTHS[m - 1]} departures and travel sites (★★★ = most popular). Picks are shown in Chinese.`],
  emptyYear: ["這一年沒有符合篩選的項目", "Nothing matches your filters this year"],
  whLegend: ["依聯合國教科文組織登錄類別分為文化、自然、複合遺產。", "Grouped by UNESCO category: cultural, natural or mixed."],
  noWh: ["目前沒有登錄的世界遺產。", "No inscribed World Heritage sites."],
  monthEvents: [m => `${m} 月節慶活動`, m => `Events in ${EN_MONTHS[m - 1]}`],
  emptyMonth: ["沒有符合條件的活動，試著放寬區域或類型篩選。", "No matching events. Try widening the region or type filters."],
  monthSeason: [m => `${m} 月適合前往`, m => `In season in ${EN_MONTHS[m - 1]}`],
  emptySeason: ["沒有符合條件的旅遊季節", "No matching travel seasons"],
  pillRegion: [r => `區域：${r}`, r => `Region: ${r}`], clearRegion: ["清除區域", "Clear region"],
  pillCountry: [c => `只看 ${c}`, c => `Only ${c}`], clearCountry: ["清除國家", "Clear country"],
  pillSearch: [q => `搜尋：${q}`, q => `Search: ${q}`], clearSearch: ["清除搜尋", "Clear search"],
  subtitle: [(nc, nwh) => `${nc} 個國家的國定假日、祭典與最佳旅遊季節，附旅行團必去景點、自然景色與 ${nwh} 處世界遺產。點地圖上的國家或下方的區域就能篩選。`,
    (nc, nwh) => `Public holidays, festivals, sports events and the best time to visit in ${nc} countries, with top sights, nature and ${nwh} World Heritage sites. Click a country on the map or a region below to filter.`],
  okinawa: ["沖繩縣", "Okinawa"],
  area: [a => `${a}地方`, a => `${a} region`],
  prefTip: [(m, n, wh) => `${m} 月 ${n} 項活動${wh ? `・世界遺產 ${wh}` : ""}`, (m, n, wh) => `${plural(n, "event")} in ${EN_MON[m - 1]}${wh ? ` · ${wh} World Heritage` : ""}`],
  allAreas: ["全部地方", "All regions"],
  areaTitle: [(a, n) => `${a}地方：${n} 個都道府縣`, (a, n) => `${a} region: ${n} prefectures`],
  choosePref: ["選擇都道府縣", "Choose a prefecture"],
  choosePrefHint: [m => `${m} 月有活動的縣市以深色標示`, m => `darker = has events in ${EN_MONTHS[m - 1]}`],
  prefNoWh: ["此縣沒有登錄的世界遺產。", "No World Heritage sites in this prefecture."],
  allPrefs: ["全部縣市", "All prefectures"],
  prefEmptyYear: [y => `${y} 年沒有符合篩選的活動`, y => `No matching events in ${y}`],
  onMap: ["在地圖上查看", "Show on map"],
  prefCounts: [(wh, ev) => `世界遺產 ${wh}・祭典 ${ev}`, (wh, ev) => `${wh} World Heritage · ${plural(ev, "festival")}`],
  noPrefMatch: [q => `找不到符合「${q}」的縣市。`, q => `No prefecture matches “${q}”.`],
  mdTitle: [y => `日本都道府縣景點・祭典筆記（${y} 年）`, y => `Japan prefectures: sights and festivals (${y})`],
  none: ["無", "None"],
  copyFail: ["無法直接複製，已選取下方文字，請按 Ctrl+C 或 ⌘C。", "Couldn't copy automatically. The text below is selected; press Ctrl+C or ⌘C."],
  copied: [n => `已複製 ${n} 個縣市的 Markdown。`, n => `Copied Markdown for ${plural(n, "prefecture")}.`],
  stars: [n => `熱門程度 ${n} 顆星（滿分 3）`, n => `Popularity: ${n} of 3 stars`],
  source: ["來源：", "Sources: "],
  loadFail: ["資料無法載入。", "Couldn't load the data. "],
};
export function t(key, ...args) {
  const v = M[key]?.[LANG === "en" ? 1 : 0];
  if (v === undefined) throw new Error(`i18n: 缺少 ${key}`);
  return typeof v === "function" ? v(...args) : v;
}
