// 讀取 data/ 底下的 JSON 資料。所有資料都從這裡進入程式。
const FILES = {
  regions: "data/regions.json",
  countries: "data/countries.json",
  events: "data/events.json",
  japan: "data/japan.json",
  picks: "data/picks.json",
  worldMap: "data/map-world.json",
  japanMap: "data/map-japan.json",
};

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} 讀取失敗（HTTP ${res.status}）`);
  return res.json();
}

function showLoadError(err) {
  const box = document.createElement("div");
  box.className = "load-error";
  box.setAttribute("role", "alert");
  box.innerHTML = `<b>資料無法載入。</b>${err.message}`;
  document.querySelector(".wrap").prepend(box);
}

export async function loadData() {
  try {
    const entries = await Promise.all(Object.entries(FILES).map(async ([k, p]) => [k, await fetchJSON(p)]));
    const d = Object.fromEntries(entries);
    return {
      REGIONS: d.regions.regions,
      REGION_OF: d.regions.regionOf,
      COUNTRIES: d.countries.countries,
      WH_NOTE: d.countries.whNote,
      EVENTS: d.events.events,
      JP_AREAS: d.japan.areas,
      PREFS: d.japan.prefectures,
      JP_NATIONAL: d.japan.national,
      PICKS: d.picks.picks,
      SOURCE_NAMES: d.picks.sourceNames,
      TOPO: d.worldMap,
      JPTOPO: d.japanMap,
    };
  } catch (err) {
    showLoadError(err);
    throw err;
  }
}
