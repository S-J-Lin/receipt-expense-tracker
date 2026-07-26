# iPhone / PWA 使用與驗收

Milestone 13 將 Receipt Tracker 做成可安裝的 mobile-first Web App。所有帳本讀寫仍連線到 Supabase；離線時不建立本機帳本、不同步佇列，也不顯示假的成功結果。

## 固定 Dark Theme 與 HH211 背景

介面固定使用 Dark Theme，沒有 Light Theme 或切換器。核心 tokens 位於
`src/app/globals.css`：background `#121212`、secondary background `#181818`、
card `#1E1E1E`、border `#2C2C2C`、primary text `#F5F5F5`、secondary text
`#A3A3A3`、accent `#4F8CFF`、success `#22C55E`、warning `#F59E0B`、error
`#EF4444`。PWA theme color 和 splash background 同為 `#121212`。

`src/components/app-background.tsx` 已建立獨立圖片層及 86–94% dark gradient
overlay，並帶輕微 blur。目前不綁定任何暫用圖片。取得 HH211 Outflow 高解析圖後：

1. 將 WebP 或 AVIF 放到 `public/background/hh211-outflow.webp`。
2. 在 `src/app/layout.tsx` 將 `<AppBackground />` 改為
   `<AppBackground src="/background/hh211-outflow.webp" />`。
3. 執行 production build，檢查文字與背景仍維持 AA 對比。

不要把圖片轉成 base64 或寫入 CSS；固定 public path 方便未來直接替換檔案。

## 安裝到 iPhone 主畫面

1. 在 iPhone Safari 開啟正式 HTTPS 網址。
2. 點「分享」後選擇「加入主畫面」，確認名稱為 Receipt Tracker。
3. 從主畫面啟動；應以 standalone 模式顯示，沒有 Safari 網址列。
4. 檢查頂部和底部沒有被 Dynamic Island 或 Home Indicator 遮住。

若選項沒有出現，確認不是無痕分頁、網址為 HTTPS，並重新整理。iOS 不一定顯示 Android/Chrome 式安裝提示，分享選單是預期流程。

## 導覽與剪貼簿

手機底部列提供 Dashboard、手動新增、ChatGPT 匯入、匯出與更多（消費紀錄）。桌面仍使用頂部導覽，品牌名稱永遠返回 Dashboard。

底部列由 root layout 唯一掛載，使用 fixed viewport positioning；其高度由
`--mobile-nav-height: 3.5rem` 集中管理。頁面會預留導覽高度、iPhone safe
area 與額外 1.5rem 間距，因此最後一張卡片和提交按鈕不會被遮住。輸入欄位
取得焦點時，手機導覽會暫時收起，讓 Safari 可以把 active input 捲動到軟體
鍵盤上方；失焦後立即恢復。Dashboard 不再重複顯示大型新增／匯入快捷鍵。

在 `/import/chatgpt` 點「從剪貼簿貼上」。Clipboard API 通常要求 HTTPS、使用者手勢和權限。失敗時會顯示「無法自動讀取剪貼簿，請長按輸入框並選擇貼上。」；手動貼上後仍可解析。

## 離線與更新策略

Service Worker 只快取離線頁、manifest、圖示和帶雜湊的 Next.js 靜態檔。它不快取 Dashboard、expense、商品、匯出、backup restore、API 或 Supabase 個人資料。導覽失敗顯示離線頁；已開啟頁面顯示離線 banner，送出會被阻擋並保留輸入。網路恢復後可重試。

部署新版後會安裝新 shell cache 並刪除舊 shell。已開啟的 standalone App 有時需完全關閉再重開才載入所有新版 client bundle。本版沒有背景同步、離線 CRUD、push notification 或自動更新提示。

## 驗收清單

- Safari 正式網址可加入主畫面，圖示正常，啟動為 standalone。
- 390 px 無水平捲動；輸入文字不因小於 16 px 觸發 iOS 自動縮放。
- 底部五個入口至少 44 px 且不被 Home Indicator 遮住。
- Dashboard、手動新增、ChatGPT 貼上／解析／儲存、詳情／編輯、商品、匯出與 backup restore 可完成。
- 拒絕 Clipboard 權限後可長按手動貼上。
- 關閉網路後有明確提示且不回報儲存成功；恢復後可重試。
- 404、載入及錯誤頁不揭露 stack trace 或 Supabase 技術細節。

## 已知限制

- 必須連線才能讀寫帳本；離線只提供安全提示與靜態 fallback。
- iOS 控制 Service Worker 更新時機，可能需關閉再開啟 App。
- Clipboard 權限取決於 Safari/iOS 設定。
- 安裝、standalone chrome、safe area 和真實 Clipboard 權限必須在實際 iPhone 驗收；390 px 模擬不能完全取代實機。
