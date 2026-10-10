import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CHATGPT_IMPORT_FILE_MAX_BYTES, readChatGPTJsonFile } from "@/lib/chatgpt-import-file";
import { parseChatGPTImport } from "@/lib/chatgpt-import-parser";
import { ChatGPTImportForm } from "@/components/chatgpt-import-form";

vi.mock("@/app/import/chatgpt/actions", () => ({ saveChatGPTImportAction: vi.fn() }));
const receipt = { merchant: "SYNTHETIC Cafe", expense_date: "2026-10-10", currency: "EUR", total_amount: 4.5, category: "餐飲", warnings: [], items: [], adjustments: [] };
const file = (text: string, name = "receipt.json") => { const blob = new Blob([text]); return { name, size: blob.size, arrayBuffer: () => blob.arrayBuffer() }; };

describe("local ChatGPT JSON files", () => {
  it("reads UTF-8 JSON unchanged and produces the same preview as pasted text", async () => {
    const text = JSON.stringify(receipt, null, 2);
    const result = await readChatGPTJsonFile(file(text, "收據.JSON"));
    expect(result).toEqual({ text, error: null });
    if (result.text !== null) expect(parseChatGPTImport(result.text)).toEqual(parseChatGPTImport(text));
  });
  it("preserves item text, date, quantity and amount", async () => {
    const value = { ...receipt, items: [{ name_original: "O’Reilly “VIP”", quantity: 1.5, amount: 4.5, brand: "N/A", category: "餐飲" }] };
    const result = await readChatGPTJsonFile(file(JSON.stringify(value)));
    const parsed = parseChatGPTImport(result.text ?? "");
    expect(parsed.data).toMatchObject({ expense_date: value.expense_date, total_amount: 4.5, items: value.items });
  });
  it("keeps syntax errors editable with the existing exact location", async () => {
    const text = '{\n"merchant": ,\n}';
    const result = await readChatGPTJsonFile(file(text));
    expect(result.text).toBe(text);
    const parsed = parseChatGPTImport(result.text ?? "");
    expect(parsed.data).toBeNull(); expect(parsed.location?.line).toBe(2); expect(parsed.error).toContain("錯誤位置");
  });
  it("keeps schema validation and dangerous-key rejection", async () => {
    for (const text of [JSON.stringify({ ...receipt, total_amount: "invented" }), JSON.stringify({ ...receipt, constructor: {} }), '{"__proto__":{"polluted":true}}', JSON.stringify({ ...receipt, items: { amount: 4.5 } })]) {
      const result = await readChatGPTJsonFile(file(text));
      expect(result.text).toBe(text); expect(parseChatGPTImport(result.text ?? "").data).toBeNull();
    }
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
  it("rejects non-json and oversized files before reading bytes", async () => {
    const arrayBuffer = vi.fn();
    expect((await readChatGPTJsonFile({ name: "receipt.txt", size: 1, arrayBuffer })).error).toContain(".json");
    expect((await readChatGPTJsonFile({ name: "receipt.json", size: CHATGPT_IMPORT_FILE_MAX_BYTES + 1, arrayBuffer })).error).toContain("400 KB");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it("keeps the parser character limit", async () => expect((await readChatGPTJsonFile(file(" ".repeat(100_001)))).error).toContain("100,000"));
  it("rejects invalid UTF-8 instead of silently replacing characters", async () => {
    const bytes = new Uint8Array([0xc3, 0x28]);
    expect((await readChatGPTJsonFile({ name: "receipt.json", size: 2, arrayBuffer: async () => bytes.buffer })).error).toContain("UTF-8");
  });
  it("shows a friendly error when an iCloud file cannot be read", async () => expect((await readChatGPTJsonFile({ name: "receipt.json", size: 1, arrayBuffer: async () => { throw new Error("unavailable"); } })).error).toContain("已下載到 iPhone"));
  it("preserves BOM for the existing safe parser and rejects empty files", async () => {
    const result = await readChatGPTJsonFile(file("\uFEFF" + JSON.stringify(receipt)));
    expect(result.text?.startsWith("\uFEFF")).toBe(true); expect(parseChatGPTImport(result.text ?? "").data).not.toBeNull();
    expect(parseChatGPTImport((await readChatGPTJsonFile(file(""))).text ?? "").data).toBeNull();
  });
});

describe("file and paste share one confirmation/save workflow", () => {
  it("renders a native single-file input and retains all paste controls", () => {
    const html = renderToStaticMarkup(createElement(ChatGPTImportForm));
    expect(html).toContain('type="file"'); expect(html).toContain('accept=".json,application/json"'); expect(html).not.toContain(" multiple");
    for (const label of ["上傳 JSON 檔案", "從剪貼簿貼上", "嘗試修復 JSON", "chatgpt-json"]) expect(html).toContain(label);
  });
  it("reads locally, parses the new text, and never auto-saves or changes import identity", () => {
    const source = readFileSync("src/components/chatgpt-import-form.tsx", "utf8");
    const load = source.slice(source.indexOf("async function loadJsonFile"), source.indexOf("async function pasteFromClipboard"));
    expect(load).toContain("readChatGPTJsonFile(file)"); expect(load).toContain("setRaw(result.text)"); expect(load).toContain("parse(false, result.text)");
    expect(load).not.toContain("saveChatGPTImportAction"); expect(load).not.toContain("fetch("); expect(load).not.toContain("parse(true");
    expect(source).toContain("importIdentity.current?.raw !== text"); expect(source).toContain("sequence !== fileReadSequence.current");
    expect(source).toContain('event.target.value = ""'); expect(source).toContain("!isPending && reconciliationConfirmed"); expect(source).not.toContain("repairConfirmed");
  });
});
