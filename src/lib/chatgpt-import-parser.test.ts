import { describe, expect, it } from "vitest";
import { parseChatGPTImport } from "@/lib/chatgpt-import-parser";

const itemized = {
  merchant: "REWE", expense_date: "2026-07-26", currency: "EUR", total_amount: 4.5,
  items: [{ name_original: "BANANEN", name_normalized: "香蕉", quantity: 1, amount: 4.5, category: "食品雜貨", confidence: 0.98 }],
  adjustments: [], warnings: [],
};

describe("parseChatGPTImport", () => {
  it("accepts pure JSON", () => expect(parseChatGPTImport(JSON.stringify(itemized)).data?.merchant).toBe("REWE"));
  it("accepts a Markdown JSON code block", () => expect(parseChatGPTImport(`\n\`\`\`json\n${JSON.stringify(itemized)}\n\`\`\`\n`).data?.items).toHaveLength(1));
  it("accepts a uniquely identifiable JSON object surrounded by prose", () => expect(parseChatGPTImport(`以下是結果：\n${JSON.stringify(itemized)}\n請人工確認。`).data?.currency).toBe("EUR"));
  it("reports invalid JSON", () => expect(parseChatGPTImport('{"merchant":}').error).toContain("JSON 格式錯誤"));
  it("reports missing required fields", () => expect(parseChatGPTImport('{"merchant":"REWE"}').error).toContain("expense_date"));
  it("rejects an impossible date", () => expect(parseChatGPTImport(JSON.stringify({ ...itemized, expense_date: "2026-02-30" })).error).toContain("有效"));
  it("rejects a negative item amount", () => expect(parseChatGPTImport(JSON.stringify({ ...itemized, items: [{ ...itemized.items[0], amount: -1 }] })).error).toContain("不可為負數"));
  it("accepts a negative adjustment", () => expect(parseChatGPTImport(JSON.stringify({ ...itemized, total_amount: 3.5, adjustments: [{ name: "Coupon", amount: -1, category: "其他" }] })).data?.adjustments[0].amount).toBe(-1));
  it("rejects an unknown category", () => expect(parseChatGPTImport(JSON.stringify({ ...itemized, items: [{ ...itemized.items[0], category: "未知" }] })).error).toContain("category"));
  it("accepts a simple expense", () => expect(parseChatGPTImport(JSON.stringify({ merchant: "Cafe", expense_date: "2026-07-26", currency: "eur", total_amount: 4.5, category: "餐飲", payment_method: "Cash", warnings: [] })).data).toMatchObject({ currency: "EUR", items: [], adjustments: [] }));
  it("rejects prototype-pollution keys", () => expect(parseChatGPTImport('{"merchant":"Cafe","expense_date":"2026-07-26","currency":"EUR","total_amount":4.5,"category":"餐飲","warnings":[],"__proto__":{}}').error).toContain("不安全欄位"));
});
