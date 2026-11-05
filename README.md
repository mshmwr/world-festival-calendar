# 環球節慶行事曆

61 個國家的國定假日、祭典活動與最佳旅遊季節，附景點、自然景色與世界遺產；日本另有 47 都道府縣專區。

線上版：https://mshmwr.github.io/world-festival-calendar/

## 功能

- 世界地圖依 14 個區域上色，點區域後可再選國家（第二層篩選）
- 2026、2027 年月曆，可依國定假日、祭典活動、旅遊季節篩選，並搜尋節慶或國家
- 國家卡片：節慶、景點、自然景色、世界遺產（標示文化、自然、複合）
- 選到日本時出現 47 都道府縣專區：縣市地圖、景點、遺跡史蹟、世界遺產、祭典活動，以及可搜尋、可複製成 Markdown 的全部縣市一覽

## 專案結構

不需要建置，直接用瀏覽器開 `index.html` 就能看。

```
index.html            頁面結構
css/style.css         樣式；區域色票在 :root 的 --r-<區域代碼>
js/components.js      共用元件：篩選按鈕列、分頁列、景點清單、節慶清單、卡片標題、地圖提示框
js/app.js             程式邏輯：狀態、地圖、月曆、側欄、日本專區
data/regions.js       區域定義與地圖上各國所屬區域
data/countries.js     61 國：景點、自然景色、世界遺產
data/events.js        各國節日、祭典、旅遊季節（日本各縣祭典除外）
data/japan.js         日本八大地方、47 都道府縣（景點、遺跡史蹟、世界遺產、祭典），以及日本國定假日
data/map-world.js     世界地圖邊界（world-atlas）
data/map-japan.js     日本都道府縣邊界（jpn-atlas）
tests/data.mjs        資料檢查
tests/smoke.mjs       瀏覽器冒煙測試
```

`index.html` 依序載入 `data/` → `js/components.js` → `js/app.js`，全部是一般的 `<script>`，所以本機直接開檔也能運作。d3 與 topojson 從 cdnjs 載入，字型來自 Google Fonts。

## 擴充資料

改資料只需要動 `data/`，不用碰 `js/`。每個資料檔開頭都有欄位說明。

- **新增節慶**：在 `data/events.js` 加一行，例如
  `{"c":"KR","t":"F","n":"活動名稱","d":"10-01~10-05","x":"一句說明"}`
  - `t`：`H` 國定假日、`F` 祭典活動、`S` 旅遊季節
  - 日期每年固定用 `d`；每年不同就用 `y`，例如 `{"2026":"02-17","2027":"02-06"}`
  - 日期是推估的就加 `"a":1`，畫面會標「約」
- **日本各縣祭典**：加在 `data/japan.js` 對應縣的 `ev`，格式同上，可省略 `c` 和 `t`（預設祭典活動）
- **景點、自然景色、世界遺產**：改 `data/countries.js` 的 `s`、`nat`、`wh`；日本各縣在 `data/japan.js` 的 `s`、`h`、`wh`
- **新增國家**：在 `data/countries.js` 加一筆，`iso` 填 ISO 3166 數字碼，並確認它在 `data/regions.js` 的 `REGION_OF` 裡屬於同一個區域；地圖上找不到的小國改填 `pin: [經度, 緯度]`
- **新增年份**：在 `js/app.js` 的 `YEARS` 加上年份，並替使用 `y` 的節慶補上該年日期

改完執行 `npm test`，`tests/data.mjs` 會檢查國家代碼、區域、日期格式、重複項目與 47 都道府縣是否齊全。

## 本機開發

直接用瀏覽器開啟 `index.html` 即可。

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` 先跑 `tests/data.mjs` 的資料檢查，再跑 `tests/smoke.mjs` 的冒煙測試：載入頁面、操作區域與國家篩選、日本專區與縣市一覽，並檢查頁面沒有錯誤、沒有橫向捲動。

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
