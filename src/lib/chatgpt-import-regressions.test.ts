import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHATGPT_IMPORT_MAX_DEPTH, parseChatGPTImport, repairChatGPTImport, scanJson } from "@/lib/chatgpt-import-parser";

// Synthetic receipts only. The first case reproduces the format a user reported:
// smart quotes, `"warnings": ,`, a single item object, and `"adjustments":` with no value.
const reported = `{
  “merchant”: “dm-drogerie markt”,
  “expense_date”: “2026-09-14”,
  “currency”: “EUR”,
  “total_amount”: 4.95,
  “warnings”: ,
  “items”: {“name_original”: “Balea Duschgel 300ml”, “name_normalized”: “沐浴乳”, “english_name”: “shower gel”, “brand”: “Balea”, “product_group”: “沐浴用品”, “quantity”: 1, “amount”: 4.95, “category”: “日用品”, “confidence”: 0.93},
  “adjustments”:
}`;

describe("reported ChatGPT output", () => {
  it("is rejected by plain parsing with a precise, engine-independent location", () => {
    const result = parseChatGPTImport(reported);
    expect(result.data).toBeNull();
    expect(result.location).toMatchObject({ line: 6, column: 15 });
    expect(result.location?.before).toContain("warnings");
    expect(result.error).toContain("第 6 行");
    expect(result.error).toContain("嘗試修復 JSON");
  });
  it("is repaired without changing merchant, item text or money", () => {
    const result = repairChatGPTImport(reported);
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ merchant: "dm-drogerie markt", expense_date: "2026-09-14", currency: "EUR", total_amount: 4.95, warnings: [], adjustments: [] });
    expect(result.data?.items).toEqual([{ name_original: "Balea Duschgel 300ml", name_normalized: "沐浴乳", english_name: "shower gel", brand: "Balea", product_group: "沐浴用品", quantity: 1, amount: 4.95, category: "日用品", confidence: 0.93 }]);
    expect(result.changes?.join("\n")).toMatch(/warnings 缺值[\s\S]*adjustments 缺值[\s\S]*items：單一物件/);
    expect(result.repairedText).toBeTruthy();
  });
  it("refuses to fill an empty adjustments value when the receipt mentions a deposit", () => {
    const withPfand = reported.replace("Balea Duschgel 300ml", "Wasser 1,5L inkl. Pfand");
    expect(repairChatGPTImport(withPfand).error).toContain("押金");
  });
  it("never fills a missing items value", () => {
    const missingItems = reported.replace(/“items”: \{[^}]*\},/, "“items”: ,");
    expect(repairChatGPTImport(missingItems).data).toBeNull();
  });
});

describe("JSON safety and diagnostics", () => {
  const base = { merchant: "Café", expense_date: "2026-09-01", currency: "EUR", total_amount: 2.5, category: "餐飲", warnings: [], adjustments: [] };
  it("rejects duplicate keys instead of silently keeping the last value", () => {
    const raw = JSON.stringify(base).replace('"total_amount":2.5', '"total_amount":2.5,"total_amount":25');
    const result = parseChatGPTImport(raw);
    expect(result.data).toBeNull();
    expect(result.error).toContain("重複的欄位「total_amount」");
    expect(repairChatGPTImport(raw).data).toBeNull();
  });
  it("rejects duplicate keys inside nested items", () => {
    const raw = '{"merchant":"x","expense_date":"2026-09-01","currency":"EUR","total_amount":1,"items":[{"name_original":"a","amount":1,"amount":2,"quantity":1,"category":"其他"}],"adjustments":[],"warnings":[]}';
    expect(parseChatGPTImport(raw).error).toContain("重複的欄位「amount」");
  });
  it("limits nesting depth", () => {
    const deep = `{"merchant":${"[".repeat(CHATGPT_IMPORT_MAX_DEPTH + 2)}${"]".repeat(CHATGPT_IMPORT_MAX_DEPTH + 2)}}`;
    expect(parseChatGPTImport(deep).error).toContain("巢狀層數");
    expect(scanJson("[".repeat(10_000))?.kind).toBe("depth");
  });
  it("keeps brackets and commas inside smart-quoted names during repair", () => {
    const raw = "{“merchant”: “Box [A,] Shop”, “expense_date”: “2026-09-01”, “currency”: “EUR”, “total_amount”: 2.5, “category”: “其他”, “warnings”: [], “adjustments”: [],}";
    expect(repairChatGPTImport(raw).data?.merchant).toBe("Box [A,] Shop");
  });
  it("quotes bare ASCII property names only in repair mode", () => {
    const raw = '{merchant: "dm", expense_date: "2026-09-01", currency: "EUR", total_amount: 1.25, category: "日用品", warnings: [], adjustments: []}';
    expect(parseChatGPTImport(raw).data).toBeNull();
    const repaired = repairChatGPTImport(raw);
    expect(repaired.data?.merchant).toBe("dm");
    expect(repaired.changes?.join()).toContain("欄位名稱 merchant 補上雙引號");
  });
  it("shows the text around the problem for small screens", () => {
    const result = parseChatGPTImport('{"merchant":"x",\n"total_amount": ,\n"warnings": []}');
    expect(result.location).toMatchObject({ line: 2, column: 17 });
    expect(result.location?.before).toBe('"total_amount": ');
    expect(result.location?.after.startsWith(",")).toBe(true);
  });
  it("explains unquoted text and units in numbers", () => {
    expect(parseChatGPTImport('{"merchant": dm}').error).toContain("英文雙引號");
    expect(parseChatGPTImport('{"merchant":"x","total_amount": 4,95}').error).toContain("第 1 行");
  });
  it("preserves Unicode product text exactly", () => {
    const name = "Bio‐Vollmilch 1,5 % „Weide“ ＆ 牛奶（無乳糖）";
    const raw = JSON.stringify({ ...base, category: undefined, items: [{ name_original: name, quantity: 1, amount: 2.5, category: "食品雜貨" }] });
    expect(parseChatGPTImport(raw).data?.items[0].name_original).toBe(name);
    expect(repairChatGPTImport(`${raw.slice(0, -2)}],}`).data?.items[0].name_original).toBe(name);
  });
  it("rejects money with more than two decimals instead of rounding", () => {
    expect(parseChatGPTImport(JSON.stringify({ ...base, total_amount: 2.499 })).error).toContain("兩位小數");
  });
});

describe("import form safeguards", () => {
  const form = readFileSync("src/components/chatgpt-import-form.tsx", "utf8");
  const action = readFileSync("src/app/import/chatgpt/actions.ts", "utf8");
  it("requires explicit confirmation when details and total differ by more than 0.01", () => {
    expect(form).toContain("reconciliationConfirmed");
    expect(action).toContain("reconciliationConfirmed");
    expect(action).toContain("Math.abs(difference) > 1");
  });
  it("guards against double submission", () => {
    expect(form).toContain("submitting.current");
  });
  it("rejects a reused key with a different payload", () => expect(action).toContain("IDEMPOTENCY_CONFLICT_MESSAGE"));
  it("looks up confirmed aliases in one batched query", () => {
    expect(action).toContain('.in("alias_normalized"');
  });
});
