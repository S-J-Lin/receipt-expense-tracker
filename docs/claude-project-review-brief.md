# Receipt Tracker — Claude Project Review Brief

Latest UX amendment (2026-10-10): repair acknowledgement is no longer a required checkbox. The user saves directly from the preview with **確認儲存**; repair notices and differences remain available. Amount mismatch acknowledgement, authorization, validation and idempotency are unchanged. References to a repair checkbox below describe earlier behavior.

## Import robustness addendum — 2026-10-10

Latest import code adds local UTF-8 JSON file selection alongside paste; both feed the same parser, preview and authorized save action. Explicit repair uses allowlisted Markdown normalization, preserving valid JSON escapes and literal value text, plus strict per-object schema validation before wrapping adjacent item objects. Missing item values, duplicates and ambiguous content are refused. Repair snippets and original/repaired text are visible; saving remains gated by repair and reconciliation acknowledgement. Errors can be copied as short diagnostics only. No Auth/RLS/RPC/Storage/Cron change or migration is part of this patch. The prior security working-tree edits remain user-owned and unstaged.

Review `src/lib/chatgpt-import-normalization.ts`, `src/lib/chatgpt-import-parser.ts`, `src/components/chatgpt-import-form.tsx`, `src/lib/chatgpt-import-robustness.test.ts`, `src/lib/fixtures/dm-import.ts` and [acceptance/limitations](json-import-repair.md). The dm test must retain six items, all metadata and €8.15 with zero cents discrepancy. Desktop/contract tests do not certify physical iPhone keyboard, Files/iCloud or installed PWA behavior.

文件日期：2026-10-08（Europe/Berlin）。第一輪僅 review，不修改程式、資料、部署或安全設定。

## 閱讀基準與證據層級

本文件根據目前 working tree、路由、元件、資料層、SQL migrations、測試及既有文件整理。掃描範圍含 134 份 source/docs/SQL/設定文字檔，並核對公開 assets 清單；不讀取或附上秘密設定、下載的帳本或 production 私人資料。這是交接掃描，不是宣稱每個模組皆已完成安全審計。

- App 基準 commit：`a3576fa`（ChatGPT JSON safe repair）；GitHub main 當時指向此 commit，Vercel commit status 為 success / Deployment has completed。本文件之後的 documentation commit 不代表新功能。
- Working tree 原有兩份未提交修改：`supabase/migrations/20260926000100_single_user_private_lockdown.sql` 與 `src/lib/security-lockdown.test.ts`。其中 local migration 多了明確移除歷史 development SELECT policy 的處理。請比較 working tree 與 HEAD；不要把 local SQL 當成 main 已包含的版本，也不要自行提交它們。
- `README.md`、`CHANGELOG.md`、`docs/production-security-verification.md` 仍保留較早的 NOT PRIVATE 記錄。後續本次對話中的正式驗收曾回報 PRIVATE，但結果尚未同步成 repo 內完整報告。兩者不可混為一談，見 H、Q。
- 所有檔案路徑均相對 repository root；方括號是實際 Next.js 動態路由資料夾名稱。

## A. Project Overview

| 項目 | 現況 |
| --- | --- |
| 名稱 | Receipt Tracker；package 名稱 receipt-expense-tracker |
| GitHub | https://github.com/S-J-Lin/receipt-expense-tracker |
| Production | https://receipt-expense-tracker-eight.vercel.app |
| Main branch | main |
| Web | Next.js 16.3.3、App Router、React 19.2.4、TypeScript 5、Tailwind CSS 4 |
| Validation/test | Zod 4；Vitest；ESLint、TypeScript、production build |
| Database | Supabase PostgreSQL、RLS、transactional RPC、private receipt Storage |
| Auth | Supabase email/password、SSR cookie session、指定唯一 authorized user |
| Hosting | GitHub main → Vercel build/deploy；Next Server Components、Server Actions、Route Handlers |
| PWA | Manifest、Apple icons、standalone installation、shell-only service worker；非離線帳本 |
| 使用者／情境 | 單人私有消費資料庫；iPhone 拍收據、ChatGPT Project 分析、貼 JSON、確認入帳 |
| 視覺 | 固定 Dark Theme、mobile-first；不提供 Light Mode 或 theme switch |

不需要 bank sync、共享帳本、企業級 multi-tenancy 或 OpenAI API。瀏覽器可持有公開 Supabase project URL/publishable key，但財務存取必須靠 JWT、RLS、RPC grants 與伺服器授權，而不是「不公開網站網址」。

## B. Current Product Workflow

1. Login：`/login` email/password → Supabase Auth → server 比對唯一允許使用者。沒有 signup UI。`/settings` 提供登出。
2. Manual：`/expenses/new` → 手動填店家、日期、總額、幣別、類別，可展開商品／調整 → schema validation → `create_manual_expense` RPC → Dashboard。
3. ChatGPT：使用者在獨立 ChatGPT Project 提供收據圖片/PDF → 複製結構化 JSON → `/import/chatgpt`。Receipt Tracker 不接收來自 OpenAI API 的分析，也不主動傳送圖片或 raw JSON 至第三方。
4. Import：貼上／讀剪貼簿 → 解析或明確點「嘗試修復 JSON」 → 安全檢查與 Zod → 商品／調整／差額預覽 → 若有修復，先核對原文與差異並勾選 → 人工編輯確認 → authenticated Server Action → atomic import RPC → 詳細資料。
5. Dashboard：月份選擇、實際總額、排除房租的日常分析、分類、固定扣款及最近消費。
6. CRUD：`/expenses` 搜尋／篩選 → `/expenses/[id]` → `/expenses/[id]/edit` 編輯 header/items/adjustments、可另處理附件與記住 alias。
7. Export：`/export` 選範圍／filters、預覽、下載四種 CSV/JSON。只有使用者另行上傳到 ChatGPT 才發生外部資料傳輸。
8. Restore：`/import/backup` → 選 JSON → 檢查版本、duplicates/conflicts/缺失附件 → Skip/Merge/Replace → 確認 → RPC → report。
9. Recurring：在「新增」頁的固定支出入口或 `/recurring` 建月規則 → Cron 到期建立正式 expense；規則本身不是支出。
10. Experimental：M7/M8 receipt upload/confirmation routes 仍存在，Storage、sessions、既有附件能力保留；不在主導覽入口，不再是主要分析流程，不應刪除。

## C. Repository Map

標記 S＝security-sensitive、U＝UI-sensitive；—＝主要為純資料／運算。標記不是風險評分。

| Path | 標記 | Responsibility / review reason |
| --- | --- | --- |
| `src/app/` | S/U | App Router routes、Server Actions、error/loading boundaries |
| `src/app/layout.tsx` | U | 單一 root shell、字體、viewport、背景、header、PWA、bottom nav |
| `src/app/page.tsx` | U | Dashboard entry，re-export DashboardPage、force-dynamic |
| `src/components/dashboard-page.tsx` | S/U | query params、月份／比較範圍、資料讀取、實際總額與 active rules |
| `src/components/dashboard-view.tsx` | U | 比較、指標、Donut、分類變化、固定支出及最近消費的實際順序 |
| `src/components/dashboard-comparison-toggle.tsx` | U | aligned/full 切換與 query state |
| `src/app/login/page.tsx` | S/U | 登入表單、登入失敗狀態、無 signup |
| `src/app/login/actions.ts` | S | password sign-in、owner 比對、sign-out |
| `src/app/settings/page.tsx` | S/U | 更多入口與登出，直接要求 owner |
| `src/app/expenses/page.tsx` | S/U | 消費清單、月份／category／merchant filters、empty/error states |
| `src/app/expenses/new/page.tsx` | U | 固定支出 prominent entry + 單筆手動表單 |
| `src/app/expenses/new/actions.ts` | S | manual validation、UUID idempotency、RPC、revalidation |
| `src/components/manual-expense-form.tsx` | U | 主 manual form、當天日期、可選商品／調整及差額確認 |
| `src/app/expenses/[id]/page.tsx` | S/U | expense、商品、調整、warnings、附件及 delete entry |
| `src/app/expenses/[id]/edit/page.tsx` | S/U | 共用 itemized editor + attachment field，不只匯入資料可用 |
| `src/app/expenses/[id]/edit/item-actions.ts` | S | atomic header/child save，之後另寫 confirmed aliases |
| `src/components/itemized-expense-editor.tsx` | U | 商品編輯、英文名稱、品牌、群組、alias confirmation／conflict UI |
| `src/app/actions.ts` | S | legacy form CRUD、附件更換／清理、delete；仍應審查 |
| `src/components/expense-form.tsx` | U | 保留的整筆 expense 表單（含 receipt confirmation 使用） |
| `src/components/delete-expense-button.tsx` | S/U | 消費永久刪除 confirmation UI |
| `src/app/import/chatgpt/page.tsx` | U | 貼 JSON 說明及 import form entry |
| `src/app/import/chatgpt/actions.ts` | S | owner auth、server schema、alias lookup、create_chatgpt_import RPC |
| `src/components/chatgpt-import-form.tsx` | U | raw/draft、repair diff、acknowledgement、可編輯預覽、save gate |
| `src/lib/chatgpt-import-parser.ts` | S | extract/Unicode lexical normalization、explicit repair、JSON.parse、unsafe keys、錯誤位置 |
| `src/lib/chatgpt-import-schema.ts` | S | strict top-level/item/adjustment schemas、真實日期／金額／category |
| `src/types/chatgpt-import.ts` | — | import payload TypeScript contract |
| `src/app/items/page.tsx` | S/U | 商品搜尋、filters、價格／商品統計 |
| `src/app/items/groups/[group]/page.tsx` | U | group route 導向共用商品分析，不另維護一套計算 |
| `src/lib/items.ts` | S | owner-only items/header/alias load 與 joins |
| `src/lib/item-analytics.ts` | — | 商品搜尋、group/brand/merchant/month statistics |
| `src/lib/product-aliases.ts` | — | alias key normalization |
| `src/app/export/page.tsx` | S/U | export filters、counts/size preview、四種 download links |
| `src/app/export/download/[format]/route.ts` | S | 401/403、format allowlist、private/no-store、下載 boundary |
| `src/lib/export-data.ts` | S | owner-only unified dataset load；in-memory filters |
| `src/lib/export.ts` | S | CSV escaping、field allowlists、backup/bundle、reconciliation |
| `src/lib/export-query.ts` | — | export query filters/date ranges |
| `src/app/import/backup/page.tsx` | U | restore entry |
| `src/components/backup-restore-form.tsx` | S/U | file parsing/preview/modes、Replace confirmation、report |
| `src/app/import/backup/actions.ts` | S | auth、revalidation、Storage checks、兩次 restore RPC orchestration |
| `src/lib/backup-restore.ts` | S | 25 MB/version/schema/unsafe-key 檢查、duplicate signatures、preview |
| `src/app/recurring/page.tsx` | S/U | active/paused/ended rule lists |
| `src/app/recurring/new/page.tsx` | U | 新增月規則 |
| `src/app/recurring/[id]/page.tsx` | S/U | rule details/history、pause/resume/cancel/generate/delete |
| `src/app/recurring/[id]/edit/page.tsx` | S/U | rule edit entry |
| `src/components/recurring-expense-form.tsx` | U | schedule/lifecycle form |
| `src/app/recurring/actions.ts` | S | owner checks、rule mutations、UUID、resume/generate RPC、DELETE confirmation |
| `src/lib/recurring-expense-data.ts` | S | owner-only rule/history reads |
| `src/lib/recurring-expenses.ts` | — | monthly validation、Berlin date、schedule helpers |
| `src/app/api/cron/recurring-expenses/route.ts` | S | CRON_SECRET → server secret client → due-generation RPC |
| `src/lib/auth.ts` | S | server-only getUser/owner allowlist、requireAuthorizedUser |
| `src/proxy.ts` | S | getClaims、cookie refresh、private-route redirects、export passthrough |
| `src/lib/supabase/server.ts` | S | SSR publishable client with session cookies；不是 service-role |
| `src/lib/supabase/client.ts` | S | browser publishable client；不得加入 server secret |
| `src/lib/supabase/cron.ts` | S | server-only SUPABASE_SECRET_KEY client，限定 Cron 用途 |
| `src/lib/expenses.ts` | S | owner-only expense load、filters、child hydration |
| `src/lib/dashboard-analysis.ts` | — | 當前 Dashboard 日期比較、日常排除、cents totals/categories |
| `src/lib/dashboard-statistics.ts` | — | 另一純統計 helper（含 dailyTotals）；不要假設被當前 Dashboard 畫面使用 |
| `src/lib/local-date.ts` | — | Europe/Berlin today/month、ISO week、anchor/clamping |
| `src/lib/money.ts` | — | cents conversion／Intl formatting，保留幣別 |
| `src/lib/manual-expense-schema.ts` | S | manual explicit-item defaults，無明細不製造 placeholder |
| `src/lib/itemized-expense-schema.ts` | S | editor payload validation |
| `src/lib/expense-validation.ts` | S | legacy form validation |
| `src/app/receipts/upload/page.tsx` | S/U | dormant upload route |
| `src/app/receipts/upload/actions.ts` | S | owner upload/session workflow |
| `src/app/receipts/confirm/[sessionId]/page.tsx` | S/U | dormant confirmation、session state、附件 |
| `src/app/receipts/confirm/[sessionId]/actions.ts` | S | owner + session capability、confirm/replace/cancel |
| `src/lib/receipt-sessions.ts` | S | scoped receipt RPC calls |
| `src/lib/receipt-session-token.ts` | S | random capability、hash、HttpOnly session cookie |
| `src/lib/receipt-storage.ts` | S | owner signed URL（1 小時）、download validation、remove |
| `src/lib/receipt-validation.ts` | S | path/type/size/magic bytes、JPEG/PNG/HEIC/HEIF/PDF |
| `src/components/receipt-upload-form.tsx` | S/U | browser upload/session UX |
| `src/components/receipt-attachment-field.tsx` | S/U | 既有消費附件更新／移除 |
| `src/components/receipt-preview.tsx` | U | 附件預览／不同格式 fallback |
| `src/components/cancel-receipt-session-button.tsx` | S/U | dormant session cancel |
| `src/components/app-header.tsx` | U | logo/home、desktop navigation、login 隱藏 |
| `src/components/mobile-nav.tsx` | U | 單一手機 bottom nav、active route、aria-current |
| `src/components/pwa-runtime.tsx` | U | SW registration、online/offline banner／submit block |
| `src/lib/pwa-config.ts` | U | nav items/active rules、theme、icons、offline/clipboard messages |
| `src/app/manifest.ts` | U | standalone PWA manifest |
| `public/sw.js` | S/U | 僅 shell cache；私人導覽 network-first，不快取帳本 |
| `src/app/offline/page.tsx` | U | offline fallback |
| `src/components/app-background.tsx` | U | 可替換 HH211 背景層；現在 layout 未傳圖片 src |
| `src/components/form-label-text.tsx` | U | optional label 標記；不是完整 FormField library |
| `src/components/ui-icon.tsx` | U | 共用 icon style |
| `src/components/notice.tsx` | U | query-driven save/delete success messages |
| `src/app/globals.css` | U | dark tokens、舊 Tailwind override、forms/focus、overflow、安全區／keyboard nav |
| `src/app/loading.tsx` | U | root skeleton；實際用於不同 routes，名稱目前為 Dashboard 載入中 |
| `src/app/error.tsx` | U | generic retry boundary（此 Next 版本的 unstable_retry） |
| `src/app/not-found.tsx` | U | shared 404；detail/session 各有 nested not-found |
| `src/types/expense.ts` | — | categories/sources/header/item/adjustment/alias types |
| `src/types/database.ts` | S | 手維護的 Supabase tables/functions contract，與 SQL 同步需審查 |
| `src/types/recurring-expense.ts` | — | rule ownership/lifecycle types |
| `src/types/receipt-upload-session.ts` | S | session model |
| `supabase/schema.sql` | S | 歷史 MVP bootstrap，非目前完整私有 schema；有 lockdown 後禁止重跑 guard |
| `supabase/migrations/` | S | 歷史 DDL/RPC + 最新 owner lockdown，必須依時間與 privilege 覆寫理解 |
| `next.config.ts` | S | Server Actions 25mb body limit；評估資源上限 |
| `vercel.json` | S | 唯一 Cron path 與 daily UTC schedule |
| `package.json`、`package-lock.json` | — | runtime/tool versions、lockfile |
| `vitest.config.ts`、`eslint.config.mjs`、`tsconfig.json` | — | tests/lint/type checking configuration |
| `AGENTS.md`、`CLAUDE.md` | — | repo instructions；CLAUDE.md 引用 AGENTS.md，改碼前需讀 bundled Next docs |

## D. Data Model

此節是「歷史 SQL + 最新 local lockdown」的目標 effective schema，不是重新讀取 production catalog 的結果。`supabase/schema.sql` 本身仍含 MVP grants，不能單獨作為 current RLS 真相。

```text
auth.users → expenses ──┬─ expense_items (CASCADE)
           → recurring_expenses → generated expenses (SET NULL on rule delete)
           → product_aliases (independent dictionary)
           → receipt_upload_sessions → optional expense (SET NULL)
receipt_tracker_private.app_owner → sole allowed auth user
backup_restore_runs → RPC idempotency/report (no direct client access)
storage.buckets / storage.objects → private receipts attachments
```

| Table | Purpose / key columns | Ownership / relations / indexes / RLS |
| --- | --- | --- |
| expenses | id、merchant、expense_date、amount numeric(12,2)、currency、category、payment_method、notes、source、import_warnings、receipt_image_path/url、raw_receipt_text、ai_confidence、timestamps；import/manual/edit idempotency keys；recurring_expense_id/recurring_period | user_id NOT NULL、default auth.uid、FK auth.users；owner-only ALL RLS；expense_date index；partial unique import/creation keys、partial unique rule+period。Total source of truth。 |
| expense_items | id、expense_id、name_original/name_normalized、english_name nullable、brand NOT NULL default N/A、product_group、quantity numeric(12,3)>0、amount>=0、category、confidence 0..1、unit/unit_quantity/notes、timestamps | 無 user_id，parent expense ownership + authorized helper；FK CASCADE；expense_id index、lower normalized_name/brand/product_group indexes。amount 是列總額，不再乘 quantity。 |
| expense_adjustments | id、expense_id、name、signed amount、category default 其他、timestamps | 無 user_id，parent ownership RLS；FK CASCADE、expense_id index；Pfand 等可正數，discount/coupon 可負數。 |
| recurring_expenses | id、merchant/amount/currency/category/payment_method/notes、recurrence_type=monthly、day_of_month 1..31、start/end_date、is_active、cancelled_at、last_generated_for、next_run_date、source=recurring、timezone=Europe/Berlin、timestamps | user_id NOT NULL default auth.uid/FK；owner-only ALL；is_active、next_run_date、day_of_month indexes；不是 expenses 的加總來源。 |
| product_aliases | id、alias、generated alias_normalized（trim/collapse whitespace/lowercase）、normalized_name、product_group/category/brand、timestamps | user_id NOT NULL default auth.uid/FK、owner-only ALL；unique alias_normalized（單人設計，不是 multi-tenant composite key）；lower normalized_name index；不依附任何單筆消費。 |
| receipt_upload_sessions | id、user_id、path、filename、mime/size、status、expires_at、access_token_hash、nullable expense/form fields、analysis_status/warnings、expense_id、timestamps | user_id NOT NULL/FK；RLS enabled，但 anon/authenticated 無直接 table CRUD，走 owner+capability 的 guarded definer RPC；pending expires_at partial index；expense_id unique FK SET NULL。正確名稱是 receipt_upload_sessions。 |
| backup_restore_runs | id、restore_key unique、restore_mode、report jsonb、created_at | 無 user_id；RLS enabled、無直接 anon/authenticated table privileges；owner-gated restore wrapper 操作、global unique key 對應結果。 |
| receipt_tracker_private.app_owner | singleton boolean PK/check、唯一 user_id FK | 不在 exposed public schema；anon/authenticated 無 schema/table 權限；helper 定義唯一 database owner，不能靠 client 任意查改。 |

`auth.users` 與 Storage tables 是 Supabase 管理的 tables，不是另建的 App domain tables。沒有 expense_items 的 user_id copy，也沒有名為 receipt_sessions 的 App table。SQL trigger `set_updated_at` 維護修改時間；部分 checks 比 UI schema 更寬，請比較 DB、Zod、types，不要假設三層完全一致。

Migration map（全部保留，不要重跑已套用檔案）：

- `supabase/migrations/20260726000100_add_mvp_expenses_select_policy.sql`：歷史 MVP SELECT。
- `supabase/migrations/20260726000200_add_mvp_anonymous_crud_policies.sql`：歷史 anon header CRUD。
- `supabase/migrations/20260726000300_add_receipt_storage.sql`：receipts bucket/path、歷史 Storage policies。
- `supabase/migrations/20260726000400_add_receipt_upload_sessions.sql`：sessions/capability RPC。
- `supabase/migrations/20260726000500_add_chatgpt_paste_import.sql`：items、adjustments、import transaction/idempotency。
- `supabase/migrations/20260726000600_add_product_normalization.sql`：metadata/english_name、aliases、atomic item editing。
- `supabase/migrations/20260726000700_add_unified_manual_expense.sql`：manual rows/idempotency RPC。
- `supabase/migrations/20260726000800_add_atomic_backup_restore.sql`：restore runs、ledger/alias restore transaction。
- `supabase/migrations/20260727000100_add_recurring_expenses.sql`：monthly rules、generation、recurring restore。
- `supabase/migrations/20260926000100_single_user_private_lockdown.sql`：owner backfill、grants/RLS/Storage、safe wrappers、Cron privilege。非通用可反覆重跑 migration。

## E. Categories

`src/types/expense.ts` 的正式 allowed values：食品雜貨、餐飲、交通、日用品、家具家電、醫療、娛樂、房租、保險、教育、旅行、其他。

category 是高階支出分類，受 enum/check 約束；product_group 是商品層级較細的自由字串（如乳製品／清潔用品），不可混用。Header category 可代表整筆主要類別；items/adjustments 各有自己的 category。Sources：manual、chatgpt_import、receipt_upload、recurring。

## F. Dashboard Calculation Rules

- 實際本月總支出：每筆 `expenses.amount` 只加一次，含房租及四種 source；本月交易數也含所有實際 expenses。Recurring 規則本身不計入。
- 日常分析：`isDailyAnalysisExpense` 以 **header category != 房租** 篩選。週/月比較、daily average、月底預估、平均每筆用此集合；分類變化再排除房租類別。不是逐項把 mixed receipt 的房租列扣除後重算整筆。
- Donut：實際本月集合、含房租。若有 items 或 adjustments，按明細 category 分配；兩者皆無則用 header category/amount。不能同時加 header 與 child totals。
- 差額：header total 與明細加總可以不同；當前分類分配不自動補一筆 remainder。Donut 顯示 header 總額、legend 用 header 作百分比分母，但繪圖 stops 用 positive allocations。請 review mismatch/negative adjustments 下的可理解性，不要為了讓圖好看改帳。
- 金額：integer cents 內部計算；各 currency 獨立，不換匯、不跨幣別相加。
- 同期 aligned：週一至 anchor 對上週同樣天數；月初至 anchor 對上月同樣日數（短月 clamp）。full：本期截至 anchor 對上週完整週期／上月完整月份。不是「兩邊都完整」的語意。
- 當月 anchor=Berlin today；非當月 anchor=該月月底。平均按 elapsed calendar days；月底預估是 rounded daily cents × daysInMonth，非預測模型。
- 實作：`src/components/dashboard-page.tsx`、`src/components/dashboard-view.tsx`、`src/lib/dashboard-analysis.ts`、`src/lib/local-date.ts`、`src/lib/money.ts`。相關 tests 為 `src/lib/dashboard-analysis.test.ts`、`src/lib/dashboard-statistics.test.ts`、`src/lib/local-date.test.ts`。

## G. Recurring Expenses

月規則使用 day_of_month、next_run_date、start_date/end_date、Europe/Berlin。29–31 日遇短月 clamp 到月底；due RPC 用 locks/skip locked、同 transaction 插入 expense 並推進日期，單次每 rule catch-up 最多 12 個 period。

- Pause：停產生，保留歷史。Resume：找 today 以後下次日期，不補暫停月份。Cancel：inactive/cancelled_at。Delete：輸入 DELETE；歷史 expense 保留、FK SET NULL。
- 「計入本期」使用 rule+recurring_period（月初日期）unique index，重複回傳既有 expense；「額外建立」刻意允許額外一筆，不等同正常月排程。
- 生成 expense.source=recurring、amount=rule amount；只有這筆 expense 算實際支出。
- `vercel.json`：每天 `10 5 * * *`，即 05:10 UTC，不是固定 05:10 Berlin。
- Cron route 先檢查 CRON_SECRET Bearer，再以 server-only SUPABASE_SECRET_KEY 執行 process_due_recurring_expenses；anon/authenticated 不應有此 RPC EXECUTE。正常 owner 的手動 generation 是另一個 RPC。
- 檔案：上方 recurring route/data/action/form map、`src/lib/recurring-expenses.test.ts` 及 recurring/security migrations。

## H. Authentication / Security Architecture

目前程式模型：Supabase email/password + SSR cookies；`src/proxy.ts` 用 verified claims 做 route gate/session refresh；data helpers/actions 再用 `src/lib/auth.ts` 的 getUser 與 AUTHORIZED_USER_ID 驗證。不能只靠導航隱藏或 middleware。

| 設定／boundary | 用途與必要 review |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY | 可公開的 project/publishable config；不是授權密碼。authenticated client 使用 session JWT，DB policies 才限制帳本。 |
| AUTHORIZED_USER_ID | server-only 唯一 allowlist；須與 DB app_owner 一致，文件不列真值。 |
| SUPABASE_SECRET_KEY | 僅 server-only Cron client；權限可 bypass RLS，不能進 browser bundle、一般 CRUD、日誌或 export。 |
| CRON_SECRET | Vercel scheduler/Route Handler Bearer 驗證；不得公開，不能用 anon key 代替。 |
| Signup | 無 public signup UI；使用者已在 Supabase 關閉公開 registration，屬部署設定，repo 本身不能證明它一直關閉。 |
| RLS | 最新 local migration 移除歷史 anon/public privileges/policies，五個 ledger tables 僅 owner；children 經 parent ownership，非 owner authenticated 也無資料。 |
| Receipts | bucket private；新檔以 user-owned prefix，上傳/update 只允許 owner prefix；owner 可讀/刪保留的 legacy anonymous prefix。signed URL 1 小時是 bearer capability，傳出去後在有效期內可被持有人用，不等同每次點擊重新登入。 |
| Restore/session RPC | 舊 definer 移至 private schema/revoke；public wrapper 授權 owner/session；search_path=''、qualified names；直接 tables 無 client grants。 |
| Invoker RPC | import/manual/edit/resume/generate/recurring restore 受 RLS；revoke PUBLIC/anon，authenticated EXECUTE。 |
| Cron RPC | security invoker、service_role-only；explicit user_id 從 owned rule 帶入，沒有 browser JWT。 |

歷史 anonymous MVP CRUD policies（含 USING(true)/WITH CHECK(true)）**确實存在於歷史 migrations**；它們被保留做稽核，不代表應維持開放。最新 lockdown 會拒絕 unexpected policies，包含 Storage object policies 的嚴格 guard；不能為了通過而自動 DROP 未知 policy。local 多出的 legacy `Allow public read during development` DROP 尚未在 HEAD。

Production 證據必須分層：

1. repo 的 `docs/production-security-verification.md` 是早期失敗報告：網站 gate 成功，但當時 REST ledger 仍可讀、helper 未生效。它不是最新成功驗收報告。
2. 後續對話記錄：2026-10-02 完整 migration 成功 COMMIT，隨後 anon tables CRUD/RPC、owner/非 owner role、網站/exports/Cron、owner CRUD/import、資料指紋及清理驗收通過，對話回報 PRIVATE；Storage 當時無檔案，不能宣稱已實測舊檔下載拒絕。非 owner 部分使用 DB role/JWT claims simulation，不是完整第二帳號 browser login。
3. 本輪只建立文件，**未重新查 live pg_policies/privileges/auth settings**。GitHub deployment success 不證明 database 安全。不要只靠本 brief 宣告今天 production PRIVATE，也不要因舊失敗報告就斷言目前仍曝露；應要求 dated evidence 或明確授權後做唯讀/live negative verification。

**Claude review repository code != production security verification。** 不要重跑已 COMMIT migration、legacy schema.sql 或舊政策；不要要求使用者傳密碼／secret／完整 UID 到 review 回覆。

## I. Security-Sensitive Files — 必問問題

- `src/lib/auth.ts`、`src/proxy.ts`、`src/app/login/actions.ts`：claims/getUser 差異、fail closed、cookie refresh/options、allowlist 未設、非 owner 登入後 session cleanup、logout/private caching；頁面與 actions 是否各自授權？
- `src/lib/supabase/client.ts`、`src/lib/supabase/server.ts`、`src/lib/supabase/cron.ts`：secret 是否只能 server import？一般資料層是否仍用 user session/RLS 而非 privilege bypass？
- `src/app/export/download/[format]/route.ts`、`src/lib/export-data.ts`、`src/lib/export.ts`：直接 URL 能否繞 auth？401/403、cache/download headers、字段 allowlist、CSV spreadsheet formula injection、signed URL/secret/internal key exclusion？
- `src/app/import/backup/actions.ts`、`src/lib/backup-restore.ts`、restore/security migrations：server 重驗證、Replace confirmations、scope/ownership、retry keys、definer search_path/grants、partial recurring restore 如何回復？
- `src/app/import/chatgpt/actions.ts`、parser/schema、manual/item actions：未知／dangerous keys、超大或深度 payload、同 key 不同 payload、ID 越權、unsafe Unicode repair、是否 server 而非只有 UI validation？
- `src/app/recurring/actions.ts`、Cron route、recurring/security migrations：anonymous generation revoked？正確 user_id、locks/conflict、today/end-date、privileged invocation資源／錯誤暴露？
- receipt helpers/actions/security migrations：private bucket、legacy URL fallback、signed URL capability lifetime、prefix/check、session owner + token、expired states、先改 DB 後清 Storage 的補償？
- `public/sw.js`：private HTML/data 是否完全不 cache？logout、offline fallback、cache lifecycle／跨 account 行為？

此處是 review questions，不是宣稱已找到 exploit。Live negative mutation tests 必須使用不可能匹配／不存在的 IDs，不能用真帳目。

## J. ChatGPT JSON Import — 2026-10-08 修復版

Route/parser/schema/form/action 見 C。Canonical output contract：`docs/chatgpt-project.md`。

- Item fields：name_original、name_normalized、english_name、brand、product_group、quantity、amount、category、confidence；optional unit/unit_quantity/notes。english_name 舊 JSON 可缺少；新 Project outputs 應提供通用英文品名，不翻譯品牌。
- brand 是 string，未知 N/A，null 拒絕；legacy 缺 brand 可 default N/A。product_group string，未知其他，legacy 缺值 default 其他；strict schema 不應拒絕這兩個已宣告字段。
- Parser 限 100,000 characters，支援 pure JSON、fenced JSON、可唯一抽取的 object；JSON.parse 後 recursively 拒絕 __proto__/prototype/constructor，再 strict Zod；不用 eval、不执行輸入。
- Normalization 只處理結構 delimiter／傳輸 whitespace；valid JSON 不改內部 Unicode。lexical scan 保留 apostrophes 與名稱的 Unicode 標點。Smart single quotes 只在判定 delimiter 時處理，歧義應拒絕。
- 「嘗試修復 JSON」可修 trailing comma、`"warnings": ,`／null／缺欄位、單一 items/adjustments object 包成 array。Missing adjustments 只有未發現 deposit/discount/Pfand/Rabatt/Coupon hints 才補 []；有線索要求手動確認，不猜金額。
- 不補造名稱、日期、數量、金額或付款資訊。Double commas/array holes、missing financial values、unknown fields、null brand 仍拒絕。
- raw 保留 client state；repair changes 與 original/repaired Pretty JSON 可展開；repair acknowledgement 未勾不能儲存。成功後直接沿用可編輯人工確認表單，不直接建立正式 expense；沒有 raw production console log/第三方 repair。
- Error 顯示原生 syntax reason，加 normalized text line/column。引擎缺位置時是 inferred missing-value 或最後檢查位置，不是假裝精準指向原始文字；請評估映射原文的可用性。
- Server Action 重新驗證 draft + UUID，requireAuthorizedUser，再 RPC；header/items/adjustments atomic。alias lookup 僅 exact confirmed mapping，否則 name_original fallback。
- unchanged raw 在同一 mounted form reparse/repair 共用 idempotency key；reload 或新 raw 會生成新 identity。這是 retry protection，不是跨 session content dedupe；不要把兩者混稱。
- `src/lib/chatgpt-import-parser.test.ts` 有 39 parser tests。上一輪 working-tree suite 176 passed；包含尚未提交的 security test，不能直接當 clean HEAD 的 test count。實際 iPhone Safari/PWA、live duplicate-save E2E 尚未完成；正式 desktop browser 390px 已確認 repair preview、gate、原文、Unicode、拒絕惡意/missing amount、無 horizontal overflow，未寫測試消費。

重点 review lexical ambiguity、silent mutations（含 Zod trim/default）、輸入長度 vs nesting depth、multiple object/duplicate keys、safe missing-adjustment inference、screen-reader announcement、large diff／back behavior、save retries；以實際結果區分 bug 與產品取捨。

## K. UI / UX Current State

Fixed dark、無 switch。背景 #121212、secondary #181818、card #1E1E1E、border #2C2C2C、text #F5F5F5/#A3A3A3、accent #4F8CFF、success/warning/error #22C55E/#F59E0B/#EF4444。Geist/Geist Mono 保留，money 使用 tabular nums。

Root layout 只掛一次 MobileNav；首頁／新增／匯入／匯出／更多；更多涵蓋 expenses detail/edit、items、recurring、backup、receipts。Login 隱藏 header/nav。Desktop md 起使用 AppHeader。Bottom nav fixed bottom/left/right、z-index 50、不隨內容捲走。

--mobile-nav-height=3.5rem；body mobile bottom padding=nav height + safe-area-inset-bottom + 1.5rem；nav 自己也有 bottom/left/right safe area。**現況例外：input/textarea/select focus 時 CSS 暫時 hide nav**，不只是偵測鍵盤。這是為了 keyboard scrolling；需評估與「永遠顯示」期望、hardware keyboard/accessibility 相容性。

不是完整 centralized component design system：有 tokens、FormLabelText、UiIcon、Notice，但沒有完整共用 Input/Select/Textarea/Card/FormField primitive。各 form 的 fieldClass/局部 Field/Label，dashboard 的 card class string 仍重複；globals.css 重寫舊 Tailwind light classes、用 !important/:has 處理 fields。不要把舊 bg-white class 直接判定實畫面為白底，應看 computed CSS。

## L. Known UI Problems / Review Checklist

以下是 code/doc 支持的風險表面或待實測，不是 24 個已證實 bugs：

- Long merchant/product names、text overflow：檢查 flex min-width:0、shrink-0 money、wrap/line-clamp/truncation；CSS overflow-x:clip 可能把超出部分藏掉，而非真正解決 layout。
- Dashboard amounts 使用 nowrap + ellipsis；極大金額能否完整取得？Donut legend、compare badges、長 date range 是否爭搶390px空間？
- Mobile horizontal scroll：forms/items/repair JSON/restore report，展開所有長字串後測試，不只首頁。
- Fixed nav overlap、safe-area、iOS toolbar变化、keyboard active field、focus 後 nav hide/restore；最後欄位/submit/Export/Restore內容不能被蓋。
- Card density、oversized cards、spacing、button hierarchy、冗餘 metrics、首頁次要資訊是否埋沒主要資訊。
- Label/value/placeholder contrast、optional styles、readonly vs disabled、select values、16px fonts、number/decimal keyboard、focus/error states。
- Shared skeleton 可能在非 Dashboard routes 出現 Dashboard loading name；辨識 loading/真正0/empty/failure是否清楚。
- Empty states 是否有正確且不重複的下一步；error actions 是否保留表單與可重試，database detail 不宜全直接露出。
- Touch targets（包括文字links/summaries/delete）、44px、focus order、screen reader labels/live regions、非color-only state、chart文本、reduced motion。
- 真實 iPhone Safari 與 installed standalone PWA：safe area、剪貼簿拒絕、安裝/update、keyboard／focus；desktop viewport 不是實機證據。

掃描 src/docs/SQL 未找到 TODO/FIXME/HACK 註記；不要把 absence of TODO 當成 absence of issues。`src/lib/form-theme.test.ts`、`src/lib/pwa-config.test.ts` 多為 contract tests，不是完整 visual/a11y E2E。

## M. Dashboard UX Review — 實際順序

1. 月份／切換月份 + 本月總支出（每 currency）。
2. 日常消費分析／不含房租提示。
3. 同期／完整週期 toggle。
4. 本週、本月比較 cards（每 currency）。
5. 快速指標：每日平均、月底日常預估、本月交易數、平均每筆。
6. 本月支出分布 Donut（含房租）。
7. 本月分類變化（不含房租，前5類 + 查看全部）。
8. 每月固定扣款（啟用中的現行規則；非選定月份的規則歷史快照）。
9. 固定支出 vs 非固定支出（source=recurring vs other actual expenses）。
10. 最近消費（選定月份，最多5筆）＋查看全部。

**現況没有 rendered daily trend chart**；純 helper 仍有 dailyTotals，但不要依歷史需求宣稱 daily trend 存在。Dashboard 沒有重複的大型新增／匯入主按鈕。交易數使用 all-expense denominator，但平均每筆用 non-rent count；請评估是否容易誤讀。

Review hierarchy/information density、哪些 cards 可合併、multi-currency重複密度、comparison semantics、是否「不含房租」與總額互相矛盾的感受、當月 vs historical months 的 anchor、fixed rules顯示與實際扣款區別。先提出具體局部改善，不要大型 redesign。

## N. Manual Entry UX

`src/components/manual-expense-form.tsx` 是主 manual form，不要只 review legacy ExpenseForm。日期以 useState initializer 的 localIsoDate()，使用 Europe/Berlin 當天，非 UTC 截日；頁面 force-dynamic。若頁面開跨午夜，不會自动更新正在編輯的日期，需當成取捨而不是隨意覆蓋。

Header可選付款/notes，預設EUR/其他；商品明細與adjustments可展開。未新增商品列的 manual 存 items=[]；**只有使用者明确新增列**後，schema才允許 N/A 等 descriptive defaults。No-placeholder export 必須維持。

review default date/DST、number input/min/step、小數locale、keyboard types/inputMode、optional marking、category usability、feedback/focus、pending/UUID duplicate prevention、一手操作。主 merchant input 現為普通 input，沒有專用 merchant autocomplete，這是可建議項目而非已實作能力。

## O. Export / Backup / Restore

- Four formats：expenses-csv（每expense）、items-csv（每item/adjustment）、full-json（versioned Full Backup）、chatgpt-json（Analysis Bundle）。
- Header authoritative amount vs detail allocation 分開；manual無item rows輸出items=[]。Bundle reconciliation 用 cents，difference=detail−expense，abs<=1cent matches；不匹配追加 warning、summary reconciled/unreconciled counts；保留原始資料不修帳。沒有明細的 manual 也會按0明細核對並標不匹配，review是否需「not applicable」。
- Backup version 1.0，1.x known-field compatibility warning，unknown major拒絕；含recurring rules/linkage、aliases及attachment paths，不含receipt bytes、signed URLs、auth/secrets/session/idempotency keys；不應把backup直接送review。
- 25MB限、Zod/unsafe/forbidden keys、preview duplicates by ID/header/detail signatures。Skip default；Merge保留現有headers，僅空child集合填入，alias衝突報告；Replace要求checkbox+exact RESTORE，刪除/重建 expenses及aliases。
- **Atomicity scope重要**：restore_receipt_tracker_backup 的ledger/alias/report在一個transaction；action隨後另呼叫 restore_recurring_expenses。第二次失敗時第一個已commit，會顯示「消費已還原，但固定支出規則還原失敗」。文件舊的「whole restore完全atomic」描述不可沿用。跨RPC retry/report/Replace/recurringlink integrity值得優先review。
- Attachments只list存在性，缺檔路徑保留、report提示，不造image；restore runs unique key只覆蓋其RPC，不能推導第二RPC同等冪等。
- Performance：getExportDataset全載accessible graph後filter，export在memory構造string，不是paged/streaming；核對Supabase預設row cap、大資料、filters與Full Backup completeness，不要憑小資料量宣稱無limit。

## P. Existing Documents

| Path | 用途 / caveat |
| --- | --- |
| `README.md` | setup/features/roadmap/migrations/test；security status段落過時 |
| `CHANGELOG.md` | milestones/近期repair；security acceptance仍舊fail描述 |
| `docs/security.md` | owner setup、RLS/grants/Storage/cron threat boundary、live驗收；部署步驟是歷史transition，不表示應重跑 |
| `docs/production-security-verification.md` | 2026-10-02較早失敗live probe報告，未同步後續成功 |
| `docs/architecture.md` | unified model/export/PWA/scheduling；historical no-Auth與restore原子性描述需以source核對 |
| `docs/database-design.md` | tables/aliases/search/statistics；仍有temporary RLS、pending/security/source省略等歷史措辭 |
| `docs/chatgpt-project.md` | receipt ChatGPT Project唯一canonical prompt/schema，含english_name/brand及repair contract |
| `docs/chatgpt-analysis.md` | bundle分析指南、隱私與不跨幣別解讀 |
| `docs/json-import-repair.md` | repair驗收紀錄、限制與真實iPhone/PWA待測步驟 |
| `docs/backup-restore.md` | restore modes/duplicates/version/receipt限制；須補充兩RPC scope理解 |
| `docs/recurring-expenses.md` | 月排程/lifecycle/Cron；no Auth、pending security為過時段落 |
| `docs/iphone-pwa.md` | installation/theme/background/offline/keyboard/safe-area驗收 |

## Q. Known Issues / Review Targets

可從 repository/source/docs 直接證實的狀態，先列 evidence 再判severity：

1. Security documentation/provenance drift：較早失敗報告与後續conversation驗收不同；local security migration/test未commit。不能盲信repo或對話作今天安全證明。
2. Restore跨兩RPC，存在明確partial-success error path；大範圍「完全atomic」敘述與source不符。
3. Whole-dataset fetch與in-memory export/search、缺明確pagination；是否實際截斷取決production row-limit/data量，尚不能斷言已丟資料。
4. Import lexical repair为自訂bounded heuristic；ambiguous inputs仍可拒絕、position可能對修復文本/推定位置，不是原文source map。新raw/reload不是content-level dedupe。
5. CSS design-system debt：tokens + legacy overrides + repeated field/card classes；fixed nav實際在所有field focus隱藏，需實機/a11y確認。
6. Item/header mismatch可留存，category分配不補差；Donut正數stops與含負數legend可能不同；需fixtures驗證可理解性，不要改金額。
7. 真實iPhone/standalone及最新repair duplicate-save E2E待測；root skeleton命名不限Dashboard但名稱如此；沒有專用merchant autocomplete／SW更新提示／offline CRUD。
8. Error helpers/action中多處拼接database error.message；review暴露程度、可理解性及retry。不是目前已發現secret洩漏。

Long-name overflow、對比、chart a11y、touch targets、density列為review targets，不能只看class就報已重現bug。沒有自動保證AA；需要computed contrast與實際操作。

## R. Constraints

Single-user private app；不要加入multi-user/公開signup、bank sync、OpenAI SDK/API/環境變數、資料自動第三方傳輸、無必要企業架構。保留Dark Theme/mobile-first/fixed nav、M7/M8已存在routes/migrations/Storage/附件，不刪原始資料。

不得client service-role、不弱化RLS/grants/auth/schema/防呆；不得為了讓SQL通過刪未知policy或重跑migration。不得直接讀／分享.env.local、Supabase/Vercelcredential files、密碼、secret、完整authorized UID或production帳本。測試先synthetic fixtures；production操作/Replace/不可還原刪除需要清楚授權與精準範圍。

## S. Instructions for Claude

先閱讀brief，再依序讀下列關鍵檔案，不要一開始改碼：

1. `AGENTS.md`、`package.json`、`src/app/layout.tsx`、`src/app/globals.css`。
2. `src/lib/auth.ts`、`src/proxy.ts`、三個Supabase client檔及最新security migration（比較working tree/HEAD，只輸出redacted結論）。
3. `src/components/dashboard-page.tsx`、`src/components/dashboard-view.tsx`、`src/lib/dashboard-analysis.ts`。
4. parser/schema/import form/action、`src/lib/chatgpt-import-parser.test.ts`、`docs/chatgpt-project.md`。
5. manual form/schema/action、item editor/item-actions、expenses/items data層。
6. export/restore/recurring資料層、actions、對應RPC migrations與Cron；最後mobile-nav、PWA、SW與state boundaries。

第一輪輸出prioritized findings，分類：Critical bugs、Security、Data integrity、UX、UI、Mobile/PWA、Accessibility、Performance、Maintainability、Quick wins。Severity使用 P0 Critical / P1 High / P2 Medium / P3 Low。

每個finding包含：severity、affected file（盡量附line）、affected route、problem、evidence/reproduction或未驗證條件、why it matters、recommended fix、estimated scope、regression risk。同一root cause不要每個category重複報告。Evidence不足就標review question，不猜不存在的bug。分離code findings、deployment設定、live security待驗證。

## T. UI Improvement Review

可提出局部card redesign、component consolidation、dashboard資訊順序或form UX改善，但保留現有Dark Theme、fixed nav、mobile-first；不加入Light Mode、不大改design。優先hierarchy、spacing、typography、overflow、responsive與a11y。

每項UI建議必須指明current component path、suggested component change、mobile impact、desktop impact、accessibility impact與scope/risk；基於actual layout順序，而不是舊roadmap。給small/medium分期，說明不改會造成的具體摩擦。

## U. Verification / Runbook for Reviewer

可用 `npm run lint`、`npx tsc --noEmit`、`npm run test`、`npm run build`；Next.js此版有breaking changes，若之後获准改code，先讀repo AGENTS與node_modules內對應Next docs。

最近repair驗證：lint/tsc/tests通過，本機default Turbopack因CSS worker port執行限制失敗，官方 `npm run build -- --webpack`成功；Vercel預設production build/deployment成功。這是不同build環境，不是把失敗默默當成功。不要修改驗證／auth以繞過本機環境限制。

Review測試矩陣：ASCII/Unicode/malformed/missing facts/unsafe keys、manual無items、positive/negative adjustments、header mismatch/multi-currency、comparison短月/DST、recurring重試/end/pause、restore各mode及第二RPC failure、所有private routes/四種exports unauthorized、390px/Safari/PWA/keyboard/offline/long names/loading/error/empty。Production負面測試先確認scope，正向destructive tests只對可識別synthetic data且清理前確認。

本brief不含秘密或私人財務內容；不改App、不更新其他roadmap或security文檔、不提交原有dirty security files。Path清單在生成後以filesystem驗證。

## Prompt for Claude

請先讀 `docs/claude-project-review-brief.md`，再按其中 S 節讀指定關鍵檔案，對 Receipt Tracker 做第一輪唯讀 review。這是 single-user、mobile-first、固定 Dark Theme 的私有記帳 App，沒有 OpenAI API；請以目前 repository 與實際 source 為準，不猜歷史架構或不存在的功能。

本輪不要修改 code、migration、Supabase/Vercel設定，不做commit/push/deploy，不讀或揭露 secrets、完整authorized UID或production私人資料。特別區分 working tree 與 HEAD、舊security失敗報告與後續驗收對話；repository code review不等於production security verification，不要自行宣告今天已PRIVATE或重跑security migration。

請給prioritized findings，分成Critical bugs、Security、Data integrity、UX、UI、Mobile/PWA、Accessibility、Performance、Maintainability、Quick wins。每個issue列P0/P1/P2/P3、affected file/line、route、problem、證據/重現或待驗證條件、影響、recommended fix、scope與regression risk。優先檢查Dashboard統計口徑/不double count、JSON safe repair與人工確認、restore兩RPC的partial success、recurring/Cron、owner/RLS/RPC/Storage、export與pagination、390px/Safari/PWA/keyboard/overflow/loading/error/empty/a11y。

可以提出UI改善，但不推翻Dark Theme、不加Light Mode、不做大型redesign；保留fixed bottom navigation/mobile-first。每項UI建議指出current component path、具體change、mobile/desktop/a11y impact。已證實問題與review targets分開，最後給可執行的quick wins及需另獲授權的驗證清單。
