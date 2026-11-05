# 環球節慶行事曆

61 個國家的國定假日、祭典活動與最佳旅遊季節，附景點、自然景色與世界遺產；日本另有 47 都道府縣專區。

線上版：https://mshmwr.github.io/world-festival-calendar/

## 功能

- 世界地圖依 14 個區域上色，點區域後可再選國家（第二層篩選）
- 2026、2027 年月曆，可依國定假日、祭典活動、旅遊季節篩選，並搜尋節慶或國家
- 國家卡片：節慶、景點、自然景色、世界遺產（標示文化、自然、複合）
- 選到日本時出現 47 都道府縣專區：縣市地圖、景點、遺跡史蹟、世界遺產、祭典活動，以及可搜尋、可複製成 Markdown 的全部縣市一覽

## 專案結構

不需要建置，也不需要安裝套件。

```
index.html               頁面結構
css/style.css            樣式；區域色票在 :root 的 --r-<區域代碼>
js/app.js                程式進入點：狀態、地圖、月曆、側欄、日本專區
js/components.js         共用元件（純函式）：篩選按鈕列、分頁列、景點清單、清單、卡片標題、地圖提示框
js/data.js               讀取 data/ 的 JSON
data/regions.json        區域定義與地圖上各國所屬區域
data/countries.json      61 國：景點、自然景色、世界遺產
data/events.json         各國節日、祭典、旅遊季節（日本各縣祭典除外）
data/japan.json          日本八大地方、47 都道府縣（景點、遺跡史蹟、世界遺產、祭典）、日本國定假日
data/map-world.json      世界地圖邊界（world-atlas）
data/map-japan.json      日本都道府縣邊界（jpn-atlas）
data/schema/             資料格式（JSON Schema），也是欄位說明
scripts/serve.mjs        本機開發伺服器
tests/data.mjs           資料檢查
tests/schema.mjs         資料檢查使用的 JSON Schema 驗證器
tests/smoke.mjs          瀏覽器冒煙測試
```

程式是 ES modules，d3 與 topojson 從 cdnjs 載入，字型來自 Google Fonts。

## 本機開發

```bash
npm run dev        # 開啟 http://localhost:8000/
```

網頁需要透過伺服器開啟，直接點兩下 `index.html` 會看到提示訊息，因為瀏覽器不允許本機檔案讀取 JSON 或執行 ES modules。`npm run dev` 只用 Node.js 內建功能，不用安裝任何套件；要換埠號可用 `PORT=3000 npm run dev`。

## 擴充資料

改資料只需要動 `data/` 底下的 JSON，不用碰 `js/`。每個 JSON 第一行的 `$schema` 指向 `data/schema/`，用 VS Code 等編輯器開啟時，滑鼠移到欄位上會顯示說明、輸入時會自動完成，填錯會畫紅線。

- **新增節慶**：在 `data/events.json` 的 `events` 加一筆，例如
  `{"c":"KR","t":"F","n":"活動名稱","d":"10-01~10-05","x":"一句說明"}`
  - `t`：`H` 國定假日、`F` 祭典活動、`S` 旅遊季節
  - 日期每年固定用 `d`；每年不同就用 `y`，例如 `{"2026":"02-17","2027":"02-06"}`
  - 日期是推估的就加 `"a":1`，畫面會標「約」
- **日本各縣祭典**：加在 `data/japan.json` 對應縣的 `ev`，格式同上，可省略 `c` 和 `t`（預設祭典活動）
- **景點、自然景色、世界遺產**：改 `data/countries.json` 的 `s`、`nat`、`wh`；日本各縣在 `data/japan.json` 的 `s`、`h`、`wh`
- **新增國家**：在 `data/countries.json` 加一筆，`iso` 填 ISO 3166 數字碼，並確認它在 `data/regions.json` 的 `regionOf` 裡屬於同一個區域；地圖上找不到的小國改填 `pin: [經度, 緯度]`
- **新增年份**：在 `js/app.js` 的 `YEARS` 加上年份，並替使用 `y` 的節慶補上該年日期

## 測試

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` 會依序執行：

1. `tests/data.mjs`：依 `data/schema/` 驗證每個 JSON 的結構（欄位名稱、類型、日期格式、必填欄位），再檢查檔案之間的對應（國家代碼、區域、地圖碼、不存在的日期、重複項目、47 都道府縣）。只動資料時，跑 `node tests/data.mjs` 就夠，不需要安裝任何套件。
2. `tests/smoke.mjs`：自動啟動本機伺服器，用瀏覽器操作區域與國家篩選、日本專區、縣市一覽、月曆展開，並檢查沒有頁面錯誤、沒有橫向捲動，以及直接開檔時會顯示說明。

要讓 push 時自動測試，把 `ci/test.yml` 移到 `.github/workflows/test.yml` 再 commit 即可（建立工作流程檔需要有 `workflow` 權限的帳號操作）。

## 部署

GitHub Pages 目前從 `gh-pages` 分支根目錄發佈，內容與 `main` 相同。更新網站時：

```bash
git push origin main
git push origin main:gh-pages
```

約一分鐘後生效。若想只維護 `main`，可到 repo 的 Settings → Pages 把來源改成 `main` 分支的 `/ (root)`，之後就不需要推 `gh-pages`。

## 資料說明

- 標「約」的日期是依往年慣例或農曆、伊斯蘭曆推算的估計值，伊斯蘭節日依月相觀測可能前後差一天，地方祭典以主辦單位當年公告為準。
- 世界遺產依 UNESCO 名錄整理（截至 2025 年第 47 屆大會），大國只列代表性項目。
- 景點清單涵蓋旅行團與旅遊書常見的主要與次要景點，無法保證完整。
- 地圖資料：world-atlas（Natural Earth）、jpn-atlas（國土地理院 Global Map Japan）。
