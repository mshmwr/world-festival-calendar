# 環球節慶行事曆

61 個國家的國定假日、祭典活動與最佳旅遊季節，附景點、自然景色與世界遺產；日本另有 47 都道府縣專區。

線上版：https://mshmwr.github.io/world-festival-calendar/

## 功能

- 世界地圖依 14 個區域上色，點區域後可再選國家（第二層篩選）
- 2026、2027 年月曆，可依國定假日、祭典活動、旅遊季節篩選，並搜尋節慶或國家
- 國家卡片：節慶、景點、自然景色、世界遺產（標示文化、自然、複合）
- 選到日本時出現 47 都道府縣專區：縣市地圖、景點、遺跡史蹟、世界遺產、祭典活動，以及可搜尋、可複製成 Markdown 的全部縣市一覽

## 專案結構

整個網站是單一靜態檔 `index.html`，資料（國家、節慶、景點、地圖邊界）都寫在檔案內，不需要建置。d3 與 topojson 從 cdnjs 載入，字型來自 Google Fonts。

## 本機開發

直接用瀏覽器開啟 `index.html` 即可。

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` 會跑 `tests/smoke.mjs` 的冒煙測試：載入頁面、操作區域與國家篩選、日本專區與縣市一覽，並檢查頁面沒有錯誤、沒有橫向捲動。

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
