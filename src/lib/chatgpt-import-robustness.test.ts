import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dmMarkdownEscaped, dmReceipt } from "@/lib/fixtures/dm-import";
import { parseChatGPTImport, repairChatGPTImport, scanJson } from "@/lib/chatgpt-import-parser";
import { chatGPTImportSchema } from "@/lib/chatgpt-import-schema";
import { normalizeMarkdownEscapes } from "@/lib/chatgpt-import-normalization";
import { readChatGPTJsonFile } from "@/lib/chatgpt-import-file";

const raw = JSON.stringify(dmReceipt);
const item = dmReceipt.items[0];
const withItems = (items: unknown) => JSON.stringify({ ...dmReceipt, items });

describe("dm receipt: escaped Markdown and full save payload", () => {
  it("repairs all six lines without changing metadata, dates or cents", () => {
    const result = repairChatGPTImport(dmMarkdownEscaped);
    expect(result.error).toBeNull(); expect(result.data).toEqual(dmReceipt);
    expect(result.data?.items).toHaveLength(6);
    expect(result.data?.items.map((row) => row.amount)).toEqual([1.25, 1.5, 2.65, 1.25, 0.55, 0.95]);
    expect(result.data?.items.reduce((sum, row) => sum + Math.round(row.amount * 100), 0)).toBe(815);
    expect(result.data?.warnings).toEqual([]); expect(result.data?.adjustments).toEqual([]);
    expect(result.repairedText).toBeTruthy(); expect(result.records?.length).toBeGreaterThan(10);
    expect(chatGPTImportSchema.safeParse(result.data).success).toBe(true);
    expect(dmMarkdownEscaped).toContain("\\_date");
  });
  it("does not silently repair Markdown when plain parse is requested", () => expect(parseChatGPTImport(dmMarkdownEscaped).data).toBeNull());
  it("leaves existing valid JSON unchanged", () => { const result = repairChatGPTImport(raw); expect(result.data).toEqual(dmReceipt); expect(result.records).toEqual([]); expect(result.repairedText).toBeUndefined(); });
  it.each(["_", "[", "]", "{", "}", "*"])("repairs allowlisted escape %s in keys only", (character) => {
    expect(normalizeMarkdownEscapes(`{"field\\${character}": 1}`).text).toBe(`{"field${character}": 1}`);
  });
  it("preserves nonstandard literal slash in names/notes, not removing content", () => {
    const input = raw.replace('"薄荷口味"', '"literal \\_ \\* \\[ \\] \\{ \\}"');
    expect(repairChatGPTImport(input).data?.items[0].notes).toBe("literal \\_ \\* \\[ \\] \\{ \\}");
  });
  it.each(['C:\\temp\\receipt', 'a "quote" and \n line\t tab', "Größe Weiß Öl 中文 “VIP” ：，", "O’Reilly's"])("preserves valid escapes and Unicode: %s", (name) => {
    const input = withItems([{ ...item, name_original: name, notes: name }]);
    const result = repairChatGPTImport(input);
    expect(result.data?.items[0]).toMatchObject({ name_original: name, notes: name }); expect(result.repairedText).toBeUndefined();
  });
  it("preserves smart quote contents in ASCII strings while fixing unrelated structure", () => {
    const name = 'Oil ”, and “ cream：，';
    const input = withItems([{ ...item, name_original: name }]).replace('"warnings":[]', '"warnings":[],');
    // A double comma is not a safe repair; use an actual trailing comma instead.
    expect(repairChatGPTImport(input).data).toBeNull();
    const trailing = withItems([{ ...item, name_original: name }]).slice(0, -1) + ",}";
    expect(repairChatGPTImport(trailing).data?.items[0].name_original).toBe(name);
  });
});

describe("bounded structure repair and fail-closed validation", () => {
  it("wraps adjacent complete items without swallowing root fields", () => {
    const adjacent = raw.replace(JSON.stringify(dmReceipt.items), dmReceipt.items.map((row) => JSON.stringify(row)).join(","));
    const result = repairChatGPTImport(adjacent);
    expect(result.data).toEqual(dmReceipt); expect(result.changes?.join()).toContain("6 個連續商品物件");
    expect(result.data?.payment_method).toBe("Card");
  });
  it.each([{ name: "Coupon", amount: -1, category: "其他" }, { ...item, source: "unexpected" }, { ...item, quantity: 0 }, { ...item, amount: "1" }])("does not misidentify non-item or invalid objects", (invalid) => {
    const adjacent = raw.replace(JSON.stringify(dmReceipt.items), JSON.stringify(item) + "," + JSON.stringify(invalid));
    expect(repairChatGPTImport(adjacent).data).toBeNull();
  });
  it("does not swallow duplicate keys in adjacent items", () => {
    const adjacent = raw.replace(JSON.stringify(dmReceipt.items), JSON.stringify(item) + ',{"name_original":"x","quantity":1,"amount":1,"amount":2,"category":"其他"}');
    expect(repairChatGPTImport(adjacent).data).toBeNull();
  });
  it.each(["warnings", "adjustments"])("discloses missing %s value", (key) => {
    const result = repairChatGPTImport(raw.replace(`"${key}":[]`, `"${key}":`));
    expect(result.data).not.toBeNull(); expect(result.records?.some((record) => record.type.includes(key))).toBe(true);
  });
  it("missing items value stays blocked and explicitly warns of missing data", () => {
    const result = repairChatGPTImport(raw.replace(JSON.stringify(dmReceipt.items), ""));
    expect(result.data).toBeNull(); expect(result.error).toContain("商品資料可能不完整");
  });
  it("omitted items is backward-compatible only for a categorized simple expense", () => {
    expect(repairChatGPTImport('{"merchant":"Cafe","expense_date":"2026-10-06","currency":"EUR","total_amount":1,"category":"餐飲","warnings":[],"adjustments":[]}').data?.items).toEqual([]);
    expect(repairChatGPTImport(raw.replace(/"items":\[[\s\S]*\],"adjustments"/, '"adjustments"')).data).toBeNull();
  });
  it("missing adjustments cannot erase deposit hints", () => expect(repairChatGPTImport(raw.replace("薄荷口味", "inkl. Pfand").replace('"adjustments":[]', '"adjustments":')).data).toBeNull());
  it.each(["total_amount", "amount", "quantity", "expense_date"])("rejects duplicate %s and never selects a value", (key) => {
    const input = key === "total_amount" || key === "expense_date" ? raw.replace(`"${key}":`, `"${key}":0,"${key}":`) : withItems([{ ...item }]).replace(`"${key}":`, `"${key}":0,"${key}":`);
    expect(repairChatGPTImport(input).error).toContain("重複的欄位");
  });
  it.each([{ total_amount: 8.151 }, { expense_date: "2026-02-30" }, { items: [{ ...item, quantity: -1 }] }, { items: [{ ...item, category: "零食" }] }, { items: [{ ...item, brand: null }] }, { source: "forbidden" }])("does not repair invalid field values %j", (patch) => expect(repairChatGPTImport(JSON.stringify({ ...dmReceipt, ...patch })).data).toBeNull());
  it("accepts unknown brand N/A", () => expect(repairChatGPTImport(withItems([{ ...item, brand: "N/A" }])).data?.items[0].brand).toBe("N/A"));
  it("rejects escaped pollution keys after normalization", () => expect(repairChatGPTImport(raw.replace('"merchant"', '"\\_\\_proto\\_\\_":{},"merchant"')).error).toContain("不安全"));
  it("rejects deep and huge payloads", () => { expect(repairChatGPTImport('{"x":' + "[".repeat(30) + "0" + "]".repeat(30) + "}").data).toBeNull(); expect(repairChatGPTImport("x".repeat(100001)).data).toBeNull(); });
  it("does not auto-complete truncated JSON", () => { const result = repairChatGPTImport(raw.slice(0, 25)); expect(result.data).toBeNull(); expect(result.location?.line).toBe(1); });
  it("reports invalid escapes consistently without relying on Safari errors", () => { const issue = scanJson('{\n"merchant":"bad\\q"}'); expect(issue?.offset).toBe(17); expect(issue?.message).toContain("跳脫"); });
  it("does not adjust a reconciliation mismatch", () => { const result = repairChatGPTImport(JSON.stringify({ ...dmReceipt, total_amount: 9 })); expect(result.data?.total_amount).toBe(9); expect(result.data?.items).toEqual(dmReceipt.items); });
  it("shares repair with browser-local file input", async () => { const blob = new Blob([dmMarkdownEscaped]); const file = await readChatGPTJsonFile({ name: "dm.json", size: blob.size, arrayBuffer: () => blob.arrayBuffer() }); expect(repairChatGPTImport(file.text ?? "").data).toEqual(dmReceipt); });
  it("UI removes repair checkbox but gates mismatch, preserves raw and double-submit guard", () => {
    const form = readFileSync("src/components/chatgpt-import-form.tsx", "utf8");
    for (const text of ["!isPending && reconciliationConfirmed", "submitting.current", "{raw}", "複製錯誤資訊", "CLIPBOARD_DENIED_MESSAGE"]) expect(form).toContain(text);
    expect(form).not.toContain("repairConfirmed"); expect(form).not.toContain("我已核對修復差異及所有商品");
    for (const text of ["repairPreview", "record.before", "record.after", "修復差異（尚未儲存）", "<summary>修復後 JSON</summary>"]) expect(form).not.toContain(text);
    expect(form).toContain("已修正格式，可以繼續儲存。");
    const copy = form.slice(form.indexOf("async function copyError"), form.indexOf("function save"));
    expect(copy).not.toContain("writeText(raw)"); expect(copy).toContain("slice(0, 80)");
  });
});
