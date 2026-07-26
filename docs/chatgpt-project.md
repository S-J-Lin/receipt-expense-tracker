# Receipt Tracker ChatGPT Project Specification

This is the canonical specification for the dedicated ChatGPT Project used with
Receipt Tracker. Update this document first whenever the interchange format
changes. Receipt Tracker does not call the OpenAI API; the user manually gives a
receipt to ChatGPT, copies the JSON, and pastes it into Receipt Tracker.

## System Prompt

```text
你是 Receipt Tracker 的收據結構化助手。分析使用者提供的收據圖片或 PDF，
逐項辨識商品，並只回傳一個有效 JSON object。不要輸出 Markdown code block、
解說、標題或 JSON 以外的文字。

輸出 merchant、expense_date、currency、total_amount、items、adjustments、
warnings。日期使用 YYYY-MM-DD，currency 使用三碼大寫 ISO 4217 代碼，所有
金額使用 JSON number，不要加入貨幣符號。

每個 item 必須包含 name_original、name_normalized、english_name、brand、
product_group、quantity、amount、category、confidence。
unit、unit_quantity、notes 只有在
收據或商品資訊足以支持時才提供。

name_original 必須忠實保留收據上的商品文字。name_normalized 描述商品種類，
不是品牌翻譯；不同品牌的同類商品使用相同 name_normalized。例如 Pril Original、
Fairy Ultra、Denkmit Spülmittel 都使用「洗碗精」，英文通用名稱使用
`dish soap`，品牌分別放在 brand。english_name 不可翻譯品牌名稱。

category 只能是：食品雜貨、餐飲、交通、日用品、家具家電、醫療、娛樂、房租、
保險、教育、旅行、其他。product_group 使用比 category 更細的穩定群組，例如
清潔用品、乳製品、蔬果、飲料、個人清潔、廚房用品、家具、電子產品、藥品、其他。

confidence 是 0 到 1。brand 永遠必須是非空字串，不可為 null、不可省略；
無法確認品牌時使用字串 "N/A"。product_group 使用「其他」，降低 confidence，
並在 warnings 中說明。

不要把 MwSt.、USt.、VAT、Rückgeld、gegeben、付款金額或找零當成商品。
Pfand、附加費放入 adjustments 並使用正數；Rabatt、Coupon、折扣放入
adjustments 並使用負數。adjustment 包含 name、amount、category。

amount 是該商品列的總金額，不是單價；quantity 另行記錄。total_amount 必須是
收據最終實付總額。若 items.amount 加 adjustments.amount 與 total_amount 不一致，
仍忠實輸出可辨識資料，並在 warnings 說明差額與可能原因。

無法辨識的商品不可省略：保留可見 name_original，name_normalized 使用最合理的
商品種類或原文，category 使用「其他」，降低 confidence 並加入 warning。
```

## JSON Contract

Top-level object:

| Field | Required | Definition |
| --- | --- | --- |
| `merchant` | Yes | Merchant shown on the receipt; never blank. |
| `expense_date` | Yes | Real calendar date in `YYYY-MM-DD`. |
| `currency` | Yes | Three-letter uppercase currency code such as `EUR`. |
| `total_amount` | Yes | Final amount paid; positive JSON number. |
| `category` | Simple expenses | Existing Receipt Tracker category. Required when there are no items or adjustments. |
| `payment_method` | No | Receipt-supported payment method, for example `Cash` or `Visa`. |
| `items` | No | Item array; defaults to an empty array for backward compatibility. |
| `adjustments` | No | Deposit, fee, discount, or coupon array; defaults to an empty array. |
| `warnings` | No | Human-review messages; defaults to an empty array. |

Item object:

| Field | Required | Definition |
| --- | --- | --- |
| `name_original` | Yes | Exact receipt wording. Do not silently replace it. |
| `name_normalized` | Recommended | Stable, user-readable product kind shared across brands/languages. |
| `english_name` | New output: Yes; old input: optional | Generic English product name. Never translate a brand as the product name. |
| `brand` | Yes | Brand only, separate from product kind. Use the string `N/A` if unknown; never `null`. |
| `product_group` | Yes for new output | Stable grouping more specific than category. Use `其他` when uncertain. Legacy input may omit it and the parser supplies `其他`. |
| `quantity` | Yes | Positive quantity. |
| `amount` | Yes | Non-negative line total. |
| `category` | Yes | One allowed broad expense category. |
| `confidence` | No | Number from 0 to 1 representing recognition confidence. |
| `unit` | No | Unit such as `ml`, `L`, `g`, `kg`, or `pcs`. |
| `unit_quantity` | No | Positive package capacity or count expressed in `unit`. |
| `notes` | No | Short factual note; never hidden reasoning or chain-of-thought. |

Adjustment object:

| Field | Required | Definition |
| --- | --- | --- |
| `name` | Yes | For example `Pfand`, `Rabatt`, or `Coupon`. |
| `amount` | Yes | Positive for deposits/fees; negative for discounts/coupons. |
| `category` | Yes | Allowed category, normally `其他`. |

## Normalization Rules

1. Prefer a generic product kind: `H-Milch 1.5%` → `牛奶`.
2. Separate brand: `Denkmit Spülmittel Zitrone` → normalized `洗碗精`, brand `Denkmit`.
3. Use the same normalized name for equivalent products across languages.
4. Do not erase useful distinctions between genuinely different product kinds.
5. Never overwrite the original receipt wording.
6. When uncertain, retain the original as normalized name and add a warning.

Suggested product groups include `清潔用品`, `乳製品`, `蔬果`, `飲料`,
`個人清潔`, `廚房用品`, `家具`, `電子產品`, `藥品`, and `其他`. Reuse an
existing stable group instead of inventing spelling variants.

## Examples

### REWE — mixed groceries and household product

```json
{
  "merchant": "REWE",
  "expense_date": "2026-07-26",
  "currency": "EUR",
  "total_amount": 18.27,
  "payment_method": "Visa",
  "items": [
    { "name_original": "BANANEN", "name_normalized": "香蕉", "english_name": "banana", "brand": "N/A", "product_group": "蔬果", "quantity": 1, "amount": 2.49, "category": "食品雜貨", "confidence": 0.98 },
    { "name_original": "PRIL ORIGINAL 500ML", "name_normalized": "洗碗精", "english_name": "dish soap", "brand": "Pril", "product_group": "清潔用品", "quantity": 1, "amount": 12.99, "category": "日用品", "confidence": 0.94, "unit": "ml", "unit_quantity": 500 }
  ],
  "adjustments": [
    { "name": "Pfand", "amount": 3.79, "category": "其他" },
    { "name": "Coupon", "amount": -1.00, "category": "其他" }
  ],
  "warnings": []
}
```

### dm — normalized cleaning product

```json
{
  "merchant": "dm",
  "expense_date": "2026-07-26",
  "currency": "EUR",
  "total_amount": 4.40,
  "items": [
    { "name_original": "Denkmit Spülmittel Zitrone", "name_normalized": "洗碗精", "english_name": "dish soap", "brand": "Denkmit", "product_group": "清潔用品", "quantity": 1, "amount": 1.95, "category": "日用品", "confidence": 0.94, "unit": "ml", "unit_quantity": 500 },
    { "name_original": "Balea Duschgel", "name_normalized": "沐浴乳", "english_name": "shower gel", "brand": "Balea", "product_group": "個人清潔", "quantity": 1, "amount": 2.45, "category": "日用品", "confidence": 0.97 }
  ],
  "adjustments": [],
  "warnings": []
}
```

### IKEA — furniture purchase

```json
{
  "merchant": "IKEA",
  "expense_date": "2026-07-26",
  "currency": "EUR",
  "total_amount": 34.99,
  "items": [
    { "name_original": "LACK Beistelltisch", "name_normalized": "邊桌", "english_name": "side table", "brand": "IKEA", "product_group": "家具", "quantity": 1, "amount": 29.99, "category": "家具家電", "confidence": 0.96 },
    { "name_original": "FRAKTA Tasche", "name_normalized": "購物袋", "english_name": "shopping bag", "brand": "IKEA", "product_group": "其他", "quantity": 1, "amount": 5.00, "category": "日用品", "confidence": 0.93 }
  ],
  "adjustments": [],
  "warnings": []
}
```

## Backward Compatibility

- Add new fields as optional whenever possible.
- Never rename or change the meaning of an existing field in place.
- Old JSON without `items`, `adjustments`, `warnings`, `english_name`, `brand`,
  `product_group`, `unit`, `unit_quantity`, or `notes` must continue to parse.
- The parser defaults an omitted legacy `brand` to `N/A`; explicit `null` is
  rejected so new producers cannot silently reintroduce nullable brands.
- If a breaking semantic change becomes unavoidable, introduce a top-level
  `schema_version` and keep the previous parser until stored/exported data is migrated.
- Update this document, Zod schemas, TypeScript types, migration/schema, examples,
  and compatibility tests in the same change.
- Receipt Tracker remains the final validator; ChatGPT output is always a draft
  requiring human confirmation.
