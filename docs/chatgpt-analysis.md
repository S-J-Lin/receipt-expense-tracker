# ChatGPT Analysis Bundle

This is the canonical guide for analyzing Receipt Tracker exports with ChatGPT.
Receipt Tracker is the personal purchase database; ChatGPT performs optional
semantic interpretation after the user explicitly uploads an export.

## Export and Upload

1. Open **匯出資料** (`/export`).
2. Choose a date range and optional merchant, category, product group, brand, or
   source filters.
3. Review the preview counts, currencies, filters, and estimated size.
4. Download **JSON — ChatGPT Analysis Bundle**.
5. Inspect the file if needed, then upload it to the dedicated ChatGPT Project.

Uploading the file sends its contents to the ChatGPT service. Receipt Tracker
never uploads it automatically and never calls an OpenAI API.

## ChatGPT Project Instruction

```text
你是我的個人消費資料分析助手。

我會上傳 Receipt Tracker 匯出的 JSON。

請只根據檔案中的實際資料回答。

規則：

- 不要編造交易、商品或金額。
- 金額必須由 amount 或 expense_total 計算。
- 多幣別不可直接加總，除非我提供匯率。
- 商品名稱不同但語意相同時，可根據 name_original、name_normalized、english_name、brand、product_group 與 aliases 合併。
- Manual expense 若 items=[]，不得猜測其內部商品。
- 回答需說明日期範圍與篩選條件。
- 若分類不確定，請明確說明推論。
- 若結果有歧義，請列出涉及的商品名稱。
```

## Suggested Questions

- 這個日期範圍中，各幣別花費最高的商店是哪些？
- 比較最近三個月的食品雜貨商品群組，不要跨幣別加總。
- 將同義商品依 normalized name、English name 與 aliases 合併後比較價格。
- 找出負 adjustment 最多的商店，列出實際 Coupon/Rabatt 名稱。
- 哪些結果因 items 為空或分類不完整而無法可靠分析？

## Field Meaning

- `expense_total`: authoritative transaction total from `expenses.amount`.
- `items`: product rows. `amount` is already the full row amount; do not multiply
  it by quantity again.
- `adjustments`: signed fees, deposits, discounts, or coupons.
- `source`: `manual`, `chatgpt_import`, or `receipt_upload`.
- `aliases`: user-confirmed mappings between source wording and normalized names.
- `date_range` and `filters`: the scope selected before download.
- `reconciliation`: cents-safe comparison of item totals plus signed adjustments
  against the authoritative expense total. `difference` is calculated detail
  total minus expense total; a difference within ±0.01 is considered matched.

Manual and ChatGPT imports use the same tables. Their source is the reliable
distinction; `confidence=1` on manual items means user-confirmed input, not AI
recognition confidence. `items=[]` means no product-level data was recorded. It
does not imply that the purchase contained no products, and missing products
must never be invented.

Every purchase contains reconciliation totals. A difference above 0.01 adds a
purchase warning and sets `matches=false` without changing any original item,
adjustment, or expense value. Summary counts show reconciled and unreconciled
expenses separately. Header-only manual expenses remain `items=[]`; they are not
converted into placeholder `N/A` item rows.

Amounts preserve their original currency. `summary.total_by_currency` keeps
currencies separate; conversion or combined totals require an explicit exchange
rate supplied by the user. When category or product metadata is incomplete,
state the limitation and use only the actual exported values. Never fabricate a
classification, transaction, item, or amount.
