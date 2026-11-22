# 回報表單後台（Cloudflare Worker）

網站的「回報錯誤或建議」表單把資料送到這個 Worker，Worker 檢查後寫進 Notion 資料庫「環球節慶行事曆｜使用者回報」。Worker 不儲存資料；Notion 金鑰只放在 Worker 的密鑰設定。

## 部署（一次性）

1. **Notion 整合**：到 https://www.notion.so/profile/integrations 新增「內部」整合，權限勾「讀取內容」與「插入內容」（讀取只用在每日提醒的筆數統計）。複製「內部整合密鑰」。
2. **讓整合能寫入資料庫**：打開資料庫 → 右上「⋯」→「連線」→ 加入剛建立的整合。
3. **建立 Worker**：Cloudflare 免費帳號 → Workers & Pages → 建立 → 「從 Hello World 開始」→ 名稱 `festival-report` → 部署 → 「編輯程式碼」，把 `worker/report.js` 全部內容貼上取代，按「部署」。
4. **設定變數**（Worker → 設定 → 變數與密鑰）：
   - `NOTION_TOKEN`：類型選「密鑰」，貼上步驟 1 的密鑰
   - `NOTION_DATA_SOURCE_ID`：類型「純文字」，值 `420fbfbd-d7bc-811a-a80b-000b50ba74f9`
5. 把 Worker 網址（例如 `https://festival-report.<帳號>.workers.dev`）填到 `js/site-config.js` 的 `reportEndpoint`，執行 `npm run build` 後部署網站。

## 每日提醒

`GET <Worker 網址>/stats` 回傳過去 24 小時新增筆數與待處理筆數（只有數字，沒有回報內容）。每日排程讀這個網址後寄信提醒，不需要 Notion 連接器。

## 防濫用

只接受來自 `https://mshmwr.github.io` 的請求、限制欄位長度與格式、有機器人用的隱藏蜜罐欄位。若之後遇到灌水，可以在 Cloudflare 對這個 Worker 加上「速率限制規則」或 Turnstile 驗證。
