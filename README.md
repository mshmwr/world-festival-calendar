# 環球節慶行事曆

60 多個國家的國定假日、祭典活動與最佳旅遊季節，附景點、自然景色與世界遺產；日本另有 47 都道府縣專區。

線上版：https://mshmwr.github.io/world-festival-calendar/

## 功能

- 世界地圖依 14 個區域上色，點區域後可再選國家（第二層篩選）
- 2026、2027 年月曆，可依國定假日、祭典活動、旅遊季節篩選，並搜尋節慶或國家
- 點月曆上的日期（或格子空白處），右側改列當天開始與進行中的活動、適合前往的地方；再點一次或按「看整個月」回到整月清單。已選國家時只列該國，國家卡片仍在下方
- 右側清單：點任一項會在原地展開介紹並在月曆標出期間，不會改變國家、區域、月份等篩選；點月曆格子裡的活動則列出當天活動並展開該項。各區域、「當天開始／進行中／適合前往」、國家卡片的各月節慶都是可收合的分組，每組先列 6 項，按「顯示全部」再展開。桌機上右側固定在畫面旁、清單在框內捲動
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
data/countries.json      各國：景點、自然景色、世界遺產
data/events.json         各國節日、祭典、旅遊季節（日本各縣祭典除外）
data/japan.json          日本八大地方、47 都道府縣（景點、遺跡史蹟、世界遺產、祭典）、日本國定假日
data/picks.json          每月推薦景點與行程（熱門程度、來源）
data/future.json         不是每年舉辦的活動的下一屆（奧運、亞運、世界盃、隔年祭典），顯示在國家頁「未來的大型活動」
data/map-world.json      世界地圖邊界（world-atlas）
data/map-japan.json      日本都道府縣邊界（jpn-atlas）
data/schema/             資料格式（JSON Schema），也是欄位說明
scripts/serve.mjs        本機開發伺服器
scripts/add-picks.mjs    把推薦資料併入 data/picks.json
scripts/build-pages.mjs  產生給搜尋引擎讀的國家頁、月份頁、sitemap.xml
scripts/make-og.mjs      產生社群分享圖 og.png
css/page.css             國家頁、月份頁的樣式
vendor/                  d3、topojson 與授權檔
c/、m/、sitemap.xml      build-pages.mjs 產生的檔案，不要手動修改
tests/data.mjs           資料檢查
tests/schema.mjs         資料檢查使用的 JSON Schema 驗證器
tests/smoke.mjs          瀏覽器冒煙測試
```

程式是 ES modules。d3 7.9.0 與 topojson 3.0.2 放在 `vendor/`（從 npm 官方套件複製，授權檔一併附上），不依賴外部 CDN；只有字型來自 Google Fonts。

## 本機開發

```bash
npm run dev        # 開啟 http://localhost:8000/
```

網頁需要透過伺服器開啟，直接點兩下 `index.html` 會看到提示訊息，因為瀏覽器不允許本機檔案讀取 JSON 或執行 ES modules。`npm run dev` 只用 Node.js 內建功能，不用安裝任何套件；要換埠號可用 `PORT=3000 npm run dev`。

## 擴充資料

改資料只需要動 `data/` 底下的 JSON，不用碰 `js/`。每個 JSON 第一行的 `$schema` 指向 `data/schema/`，用 VS Code 等編輯器開啟時，滑鼠移到欄位上會顯示說明、輸入時會自動完成，填錯會畫紅線。

- **新增節慶**：在 `data/events.json` 的 `events` 加一筆，例如
  `{"c":"KR","t":"F","n":"活動名稱","d":"10-01~10-05","x":"一句說明"}`
  - `t`：`H` 國定假日、`F` 祭典活動、`G` 體育賽事（F1、奧運、世界盃、馬拉松、相撲等）、`S` 旅遊季節
  - 日期每年固定用 `d`；每年不同就用 `y`，例如 `{"2026":"02-17","2027":"02-06"}`
  - 國定假日（日本以外 60 國）是以 Python 套件 [holidays](https://pypi.org/project/holidays/) 的各國官方假日資料為底，補休、連續幾天的假日併成一筆、翻成中文；斯里蘭卡另外手動整理。伊斯蘭曆、農曆等推估日期標 `"a":1`
  - 日期是推估的就加 `"a":1`，畫面會標「約」
- **日本各縣祭典**：加在 `data/japan.json` 對應縣的 `ev`，格式同上，可省略 `c` 和 `t`（預設祭典活動）
- **景點、自然景色、世界遺產**：改 `data/countries.json` 的 `s`、`nat`、`wh`；日本各縣在 `data/japan.json` 的 `s`、`h`、`wh`
- **新增國家**：在 `data/countries.json` 加一筆，`iso` 填 ISO 3166 數字碼，並確認它在 `data/regions.json` 的 `regionOf` 裡屬於同一個區域；地圖上找不到的小國改填 `pin: [經度, 緯度]`
- **每月推薦**：在 `data/picks.json` 的 `picks.<月份>.<國家代碼>` 加景點或行程，欄位有 `n` 名稱、`pop` 熱門程度 1～3、`x` 說明、`src` 來源網址，日本可加 `p` 縣市代碼。熱門程度的標準寫在 `data/schema/picks.schema.json`。也可以把多國資料寫成一個 JSON，再用 `node scripts/add-picks.mjs <月份> <檔案>` 一次併入。要求某個月份涵蓋全部國家時，把月份加進 `tests/data.mjs` 的 `REQUIRED_MONTHS`
- **新增年份**：在 `js/app.js` 的 `YEARS` 加上年份，並替使用 `y` 的節慶補上該年日期
- **贊助按鈕**：`scripts/build-pages.mjs` 的 `SUPPORT_URL`（目前是 Ko-fi 頁面），改完執行 `npm run build`，主頁和所有靜態頁的頁尾都會更新；空白則不顯示
- **待確認日期**：`npm run pending` 產生 `docs/pending-dates.md`（推估日期、缺明年日期的活動），查證與更新流程見 `docs/date-check.md`

## 搜尋引擎最佳化（SEO）

主頁的內容是 JavaScript 畫出來的，搜尋引擎不一定讀得到，所以另外產生不需要 JavaScript 的靜態頁面：

- `c/<國家代碼>.html`：每國一頁，含 12 個月推薦、節日祭典、景點、自然景色、世界遺產
- `m/<月>.html`：12 個月各一頁，含當月最熱門、各國推薦與節日
- 閱讀進度：寬螢幕在右側固定一條時間軸（區域是方形節點、國家或月份是圓點，只展開目前所在區域的國家），線會畫到目前閱讀位置、經過的節點填色，點節點可跳到該段；螢幕寬度不夠時改成右下角的小標籤（例如「東南亞 › 泰國・42%」）。月份頁另有區域跳轉連結；程式在 `js/page.js`，不支援 JavaScript 時內容照常顯示
- 月份頁最後有「常見問題」（最熱門去哪、日韓泰各玩什麼、哪些國家放假），全部從資料自動產生，並附 FAQPage 結構化資料，方便搜尋引擎與 AI 摘要引用
- 網站圖示：`favicon.svg` 與 `favicon-192.png`（Google 搜尋結果用 PNG）
- `sitemap.xml`：全部頁面的網址
- `index.html` 底部 `<!-- seo:links -->` 標記之間的連結清單

**改過 `data/` 之後要執行 `npm run build`（`node scripts/build-pages.mjs`）再 commit**，`npm test` 會檢查這些檔案是不是最新的。分享圖 `og.png` 用 `node scripts/make-og.mjs` 產生。

主頁網址可以帶參數：`?c=JP` 開在日本、`?m=7` 開在 7 月（今年已過就開明年），可以一起用，例如 `?c=FR&m=7`。

GitHub Pages 的專案網站不在網域根目錄，放 `robots.txt` 無效。要讓 Google 更快收錄，可到 Google Search Console 新增網址前綴資源 `https://mshmwr.github.io/world-festival-calendar/`，驗證後提交 `sitemap.xml`。根目錄的 `google0c6ad999e91924d9.html` 是 Search Console 的擁有權驗證檔，刪掉會失去驗證，請保留。

## 資訊安全

- 網站是純靜態頁面，沒有後端、帳號、表單或 Cookie，不收集任何個人資料；瀏覽器只在本機記住月曆的類型篩選。
- `index.html` 與所有靜態頁都有內容安全政策（CSP）：只允許執行網站自己的程式，樣式與字型只允許 Google Fonts，資料只從網站本身讀取。**改了 `index.html` 裡的內嵌 `<script>` 時，要重新計算 CSP 裡的 `sha256-…` 雜湊**，否則那段程式會被擋下（`npm test` 會檢查出來）。
- 使用者輸入的搜尋文字一律跳脫後才放進畫面；推薦來源網址在資料檢查時限定 `https://`。
- `npm run dev` 的本機伺服器只聽 127.0.0.1，不提供專案以外的檔案，也不提供 `.git` 等隱藏檔案。
- GitHub Pages 無法自訂 HTTP 標頭，所以 `X-Frame-Options`、HSTS 這類設定沒辦法加；github.io 本身已強制 HTTPS。

## 測試

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` 會依序執行：

1. `tests/data.mjs`：依 `data/schema/` 驗證每個 JSON 的結構（欄位名稱、類型、日期格式、必填欄位），再檢查檔案之間的對應（國家代碼、區域、地圖碼、不存在的日期、重複項目、47 都道府縣）。只動資料時，跑 `node tests/data.mjs` 就夠，不需要安裝任何套件。
2. `tests/pages.mjs`：檢查靜態頁面是最新的，每頁都有標題、說明、canonical、單一 `<h1>`、分享圖，標題與說明不重複，站內連結都指到存在的檔案。
3. `tests/smoke.mjs`：自動啟動本機伺服器，用瀏覽器操作區域與國家篩選、日本專區、縣市一覽、月曆展開、網址參數，並檢查沒有頁面錯誤、沒有橫向捲動、CSP 沒有擋下任何資源、搜尋文字不會被當成 HTML 執行、本機伺服器拒絕隱藏檔案，以及直接開檔時會顯示說明。不需要連網。

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
