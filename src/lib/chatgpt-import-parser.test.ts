import { describe, expect, it } from "vitest";
import { parseChatGPTImport, repairChatGPTImport } from "@/lib/chatgpt-import-parser";
import { readFileSync } from "node:fs";

const itemized = {
  merchant: "REWE", expense_date: "2026-07-26", currency: "EUR", total_amount: 4.5,
  items: [{ name_original: "BANANEN", name_normalized: "香蕉", quantity: 1, amount: 4.5, category: "食品雜貨", confidence: 0.98 }],
  adjustments: [], warnings: [],
};

describe("parseChatGPTImport", () => {
  it("accepts pure JSON", () => expect(parseChatGPTImport(JSON.stringify(itemized)).data?.merchant).toBe("REWE"));
  it("normalizes JSON entirely delimited by smart double quotes", () => {
    const smart = JSON.stringify(itemized, null, 2).replaceAll('"', (match, offset) => {
      const before = JSON.stringify(itemized, null, 2).slice(0, offset);
      return (before.match(/"/g)?.length ?? 0) % 2 === 0 ? "“" : "”";
    });
    const result = parseChatGPTImport(smart);
    expect(result.data?.merchant).toBe("REWE");
    expect(result.notice).toContain("已自動修正");
  });
  it("accepts mixed ASCII, smart, and full-width double quotes", () => {
    const result = parseChatGPTImport('{"merchant”： ＂Cafe＂, “expense_date": "2026-07-26", "currency": “EUR”, "total_amount": 4.5, "category": “餐飲”, "warnings": []}');
    expect(result.data?.merchant).toBe("Cafe");
    expect(result.notice).toContain("智慧引號");
  });
  it("normalizes full-width structural colons and commas", () => {
    const result = parseChatGPTImport('{"merchant"："Cafe"，"expense_date"："2026-07-26"，"currency"："EUR"，"total_amount"：4.5，"category"："餐飲"，"warnings"：[]}');
    expect(result.data?.total_amount).toBe(4.5);
  });
  it("removes BOM and accepts non-breaking whitespace", () => {
    const input = `\uFEFF{\u00A0"merchant": "Cafe", "expense_date": "2026-07-26", "currency": "EUR", "total_amount": 4.5, "category": "餐飲", "warnings": []\u00A0}`;
    expect(parseChatGPTImport(input).data?.merchant).toBe("Cafe");
  });
  it("preserves apostrophes inside product names", () => {
    const input = JSON.stringify({ ...itemized, items: [{ ...itemized.items[0], name_original: "Farmer’s O'Reilly Apples" }] });
    expect(parseChatGPTImport(input).data?.items[0].name_original).toBe("Farmer’s O'Reilly Apples");
  });
  it("only converts smart single quotes when they are safe JSON delimiters", () => {
    const input = "{‘merchant’: ‘O’Reilly Cafe’, ‘expense_date’: ‘2026-07-26’, ‘currency’: ‘EUR’, ‘total_amount’: 4.5, ‘category’: ‘餐飲’, ‘warnings’: []}";
    expect(parseChatGPTImport(input).data?.merchant).toBe("O’Reilly Cafe");
  });
  it("rejects invalid normalized JSON with attempted-repair context and position", () => {
    const result = parseChatGPTImport('{“merchant”：}');
    expect(result.error).toContain("已偵測到智慧引號或全形標點並嘗試自動修正");
    expect(result.error).toContain("錯誤位置：");
  });
  it("still rejects prototype-pollution keys after smart punctuation repair", () => {
    const result = parseChatGPTImport('{“merchant”:“Cafe”,“expense_date”:“2026-07-26”,“currency”:“EUR”,“total_amount”:4.5,“category”:“餐飲”,“warnings”:[],“__proto__”:{}}');
    expect(result.error).toContain("不安全欄位");
  });
  it("does not alter money or punctuation inside text values", () => {
    const input = '{“merchant”:“Shop：West，Hall”,“expense_date”:“2026-07-26”,“currency”:“EUR”,“total_amount”:18.27,“category”:“其他”,“warnings”:[]}';
    expect(parseChatGPTImport(input).data).toMatchObject({ merchant: "Shop：West，Hall", total_amount: 18.27 });
  });
  it("accepts a Markdown JSON code block", () => expect(parseChatGPTImport(`\n\`\`\`json\n${JSON.stringify(itemized)}\n\`\`\`\n`).data?.items).toHaveLength(1));
  it("accepts a uniquely identifiable JSON object surrounded by prose", () => expect(parseChatGPTImport(`以下是結果：\n${JSON.stringify(itemized)}\n請人工確認。`).data?.currency).toBe("EUR"));
  it("reports invalid JSON", () => expect(parseChatGPTImport('{"merchant":}').error).toContain("內容不是有效 JSON"));
  it("reports missing required fields", () => expect(parseChatGPTImport('{"merchant":"REWE"}').error).toContain("expense_date"));
  it("rejects an impossible date", () => expect(parseChatGPTImport(JSON.stringify({ ...itemized, expense_date: "2026-02-30" })).error).toContain("有效"));
  it("rejects a negative item amount", () => expect(parseChatGPTImport(JSON.stringify({ ...itemized, items: [{ ...itemized.items[0], amount: -1 }] })).error).toContain("不可為負數"));
  it("accepts a negative adjustment", () => expect(parseChatGPTImport(JSON.stringify({ ...itemized, total_amount: 3.5, adjustments: [{ name: "Coupon", amount: -1, category: "其他" }] })).data?.adjustments[0].amount).toBe(-1));
  it("rejects an unknown category", () => expect(parseChatGPTImport(JSON.stringify({ ...itemized, items: [{ ...itemized.items[0], category: "未知" }] })).error).toContain("category"));
  it("accepts a simple expense", () => expect(parseChatGPTImport(JSON.stringify({ merchant: "Cafe", expense_date: "2026-07-26", currency: "eur", total_amount: 4.5, category: "餐飲", payment_method: "Cash", warnings: [] })).data).toMatchObject({ currency: "EUR", items: [], adjustments: [] }));
  it("keeps old item JSON compatible without english_name and applies safe defaults", () => expect(parseChatGPTImport(JSON.stringify(itemized)).data?.items[0]).toMatchObject({ brand: "N/A", product_group: "其他" }));
  it("accepts brand and product_group without treating them as unknown strict keys", () => expect(parseChatGPTImport(JSON.stringify({ ...itemized, items: [{ ...itemized.items[0], brand: "Denkmit", product_group: "清潔用品" }] })).data?.items[0]).toMatchObject({ brand: "Denkmit", product_group: "清潔用品" }));
  it("accepts english_name", () => expect(parseChatGPTImport(JSON.stringify({ ...itemized, items: [{ ...itemized.items[0], english_name: "dish soap" }] })).data?.items[0].english_name).toBe("dish soap"));
  it("accepts N/A as an unknown brand", () => expect(parseChatGPTImport(JSON.stringify({ ...itemized, items: [{ ...itemized.items[0], brand: "N/A" }] })).data?.items[0].brand).toBe("N/A"));
  it("rejects null brand with a clear message", () => expect(parseChatGPTImport(JSON.stringify({ ...itemized, items: [{ ...itemized.items[0], brand: null }] })).error).toContain("不可為 null"));
  it("rejects prototype-pollution keys", () => expect(parseChatGPTImport('{"merchant":"Cafe","expense_date":"2026-07-26","currency":"EUR","total_amount":4.5,"category":"餐飲","warnings":[],"__proto__":{}}').error).toContain("不安全欄位"));
});

describe("explicit safe JSON repair", () => {
  it("keeps valid JSON unchanged and RFC 8259 parseable", () => {
    const raw = JSON.stringify(itemized); const result = repairChatGPTImport(raw);
    expect(result.data?.items).toHaveLength(1); expect(result.changes).toEqual([]); expect(result.repairedText).toBeUndefined();
  });
  it("preserves smart quotes, full-width punctuation, BOM and NBSP inside valid strings", () => {
    const name = 'O’Reilly “VIP”，＂商品＂：\u00A0\uFEFF Apples';
    expect(repairChatGPTImport(JSON.stringify({ ...itemized, items: [{ ...itemized.items[0], name_original: name }] })).data?.items[0].name_original).toBe(name);
  });
  it("preserves Unicode text while fixing structural smart delimiters", () => {
    const raw = '{“merchant”： “Shop “VIP” West，Hall”, “expense_date”： “2026-07-26”, “currency”： “EUR”, “total_amount”： 4.5, “category”： “其他”, “warnings”： [], “adjustments”： []}';
    const result = repairChatGPTImport(raw); expect(result.data?.merchant).toBe('Shop “VIP” West，Hall'); expect(JSON.parse(result.repairedText!).merchant).toBe('Shop “VIP” West，Hall');
  });
  it("fixes warnings followed by a comma without inventing its content", () => {
    const raw = JSON.stringify(itemized).replace('"warnings":[]', '"warnings": , "payment_method":"Cash"');
    const result = repairChatGPTImport(raw); expect(result.data?.warnings).toEqual([]); expect(result.changes?.join()).toContain("warnings 缺值"); expect(raw).toContain('"warnings": ,');
  });
  it("notifies about omitted warnings and adjustments", () => {
    const result = repairChatGPTImport(JSON.stringify({ merchant: "Cafe", expense_date: "2026-07-26", currency: "EUR", total_amount: 4.5, category: "餐飲" }));
    expect(result.data).toMatchObject({ warnings: [], adjustments: [] }); expect(result.changes).toHaveLength(2);
  });
  it("repairs null warnings, but not an arbitrary warnings string", () => {
    expect(repairChatGPTImport(JSON.stringify({ ...itemized, warnings: null })).data?.warnings).toEqual([]);
    expect(repairChatGPTImport(JSON.stringify({ ...itemized, warnings: "Pfand" })).error).toContain("warnings");
  });
  it("wraps single item and adjustment objects without changing values", () => {
    const result = repairChatGPTImport(JSON.stringify({ ...itemized, items: itemized.items[0], adjustments: { name: "Coupon", amount: -1, category: "其他" } }));
    expect(result.data?.items[0]).toMatchObject(itemized.items[0]); expect(result.data?.adjustments).toEqual([{ name: "Coupon", amount: -1, category: "其他" }]); expect(result.changes).toHaveLength(2);
  });
  it("removes trailing commas but preserves commas inside names", () => {
    const raw = JSON.stringify({ ...itemized, merchant: "Shop, West" }).replace('"warnings":[]}', '"warnings":[],}');
    expect(repairChatGPTImport(raw).data?.merchant).toBe("Shop, West");
    expect(repairChatGPTImport(JSON.stringify(itemized).replace('"adjustments":[]', '"adjustments":[,]')).data).toBeNull();
    expect(repairChatGPTImport(JSON.stringify({ ...itemized, merchant: 'Shop ＂VIP＂, “West”, End' }).replace('"warnings":[]}', '"warnings":[],}')).data?.merchant).toBe('Shop ＂VIP＂, “West”, End');
    expect(repairChatGPTImport(JSON.stringify(itemized).replace('"warnings":[]}', '"warnings":,}')).data?.warnings).toEqual([]);
  });
  it("refuses double commas and missing money, quantity, date or product name", () => {
    for (const raw of [JSON.stringify(itemized).replace('"currency":"EUR",', '"currency":"EUR",,'), JSON.stringify(itemized).replace('"amount":4.5', '"amount":'), JSON.stringify(itemized).replace('"quantity":1,', ''), JSON.stringify(itemized).replace('"expense_date":"2026-07-26",', ''), JSON.stringify(itemized).replace('"name_original":"BANANEN",', '')]) {
      const result = repairChatGPTImport(raw); expect(result.data).toBeNull(); expect(result.error).toBeTruthy();
    }
  });
  it("reports line/column for unsafe missing values", () => expect(repairChatGPTImport('{\n"total_amount": ,\n"warnings": []\n}').error).toMatch(/第 2 行/));
  it("refuses to fill missing adjustments if receipt content suggests a deposit or discount", () => {
    const value: Record<string, unknown> = { ...itemized, warnings: ["Pfand may be missing"] }; delete value.adjustments;
    expect(repairChatGPTImport(JSON.stringify(value)).error).toContain("請手動確認");
  });
  it("still rejects dangerous keys, unknown keys, null brand and executable input", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) expect(repairChatGPTImport(JSON.stringify(itemized).replace('"warnings":[]', `"warnings":[],"${key}":{}`)).error).toContain("不安全欄位");
    expect(repairChatGPTImport(JSON.stringify({ ...itemized, items: { ...itemized.items[0], unexpected: 1 } })).error).toContain("Unrecognized");
    expect(repairChatGPTImport(JSON.stringify({ ...itemized, items: { ...itemized.items[0], brand: null } })).error).toContain("不可為 null");
    expect(repairChatGPTImport('{"merchant":(()=>alert(1))()}').data).toBeNull();
  });
  it("retains escaped quotes, apostrophes and exact money after repair", () => {
    const name = 'Farmer’s O\'Reilly "Apples", 1kg';
    const result = repairChatGPTImport(JSON.stringify({ ...itemized, items: { ...itemized.items[0], name_original: name } }));
    expect(result.data?.items[0].name_original).toBe(name); expect(result.data?.items[0].amount).toBe(4.5); expect(result.data?.payment_method).toBeUndefined();
  });
  it("keeps idempotency and human confirmation in the save workflow", () => {
    const form = readFileSync("src/components/chatgpt-import-form.tsx", "utf8"), action = readFileSync("src/app/import/chatgpt/actions.ts", "utf8");
    expect(form).toContain("importIdentity.current?.raw !== text"); expect(form).toContain("const canSave = !isPending && repairConfirmed && reconciliationConfirmed;"); expect(form).toContain("disabled={!canSave}"); expect(action).toContain("await requireAuthorizedUser()"); expect(action).toContain("p_idempotency_key: validKey.data"); expect(action).toContain("chatGPTImportSchema.safeParse(payload)");
  });
});
