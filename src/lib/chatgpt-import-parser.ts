import { chatGPTImportSchema } from "@/lib/chatgpt-import-schema";
import type { ChatGPTImport } from "@/types/chatgpt-import";

export const CHATGPT_IMPORT_MAX_LENGTH = 100_000;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export type ImportParseResult =
  | { data: ChatGPTImport; error: null; notice: string | null; repairedText?: string; changes?: string[] }
  | { data: null; error: string; notice: null; repairedText?: undefined; changes?: undefined };

export const SMART_PUNCTUATION_NOTICE = "已自動修正 ChatGPT 輸出中的智慧引號與全形標點。";
const SMART_DOUBLE_QUOTES = new Set(["“", "”", "＂"]);
const SMART_SINGLE_QUOTES = new Set(["‘", "’"]);
const STRING_START_CONTEXT = new Set(["{", "[", ",", ":", "，", "："]);
const STRING_END_CONTEXT = new Set([":", ",", "}", "]"]);

type NormalizedCandidate = { text: string; changed: boolean; detectedSmartPunctuation: boolean; repairedSmartPunctuation: boolean };

function previousSignificant(value: string, index: number) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) if (!/\s/.test(value[cursor])) return value[cursor];
  return "";
}

function nextSignificant(value: string, index: number) {
  for (let cursor = index + 1; cursor < value.length; cursor += 1) if (!/\s/.test(value[cursor])) return value[cursor];
  return "";
}

function canOpenString(value: string, index: number) {
  return STRING_START_CONTEXT.has(previousSignificant(value, index));
}

function canCloseString(value: string, index: number) {
  const next = nextSignificant(value, index);
  return next === "" || STRING_END_CONTEXT.has(next) || next === "：" || next === "，";
}

export function normalizeChatGPTJsonPunctuation(candidate: string): NormalizedCandidate {
  // Valid JSON is authoritative: never rewrite Unicode inside its string values.
  try { JSON.parse(candidate); return { text: candidate, changed: false, detectedSmartPunctuation: false, repairedSmartPunctuation: false }; } catch { /* Scan invalid input only. */ }
  const withoutTransportCharacters = candidate;
  let changed = false;
  const detectedSmartPunctuation = /[“”＂‘’：，]/.test(candidate);
  let repairedSmartPunctuation = false;
  let quote: "double" | "single" | null = null;
  let escaped = false;
  let nestedSmartQuotes = 0;
  let normalized = "";

  for (let index = 0; index < withoutTransportCharacters.length; index += 1) {
    const character = withoutTransportCharacters[index];
    if (quote === "double") {
      if (escaped) { normalized += character; escaped = false; continue; }
      if (character === "\\") { normalized += character; escaped = true; continue; }
      if (character === "“") { nestedSmartQuotes++; normalized += character; continue; }
      if (character === "”" && nestedSmartQuotes > 0) { nestedSmartQuotes--; normalized += character; continue; }
      if (character === '"' || (SMART_DOUBLE_QUOTES.has(character) && canCloseString(withoutTransportCharacters, index))) {
        normalized += '"'; quote = null; if (character !== '"') { changed = true; repairedSmartPunctuation = true; } continue;
      }
      normalized += character; continue;
    }
    if (quote === "single") {
      if (SMART_SINGLE_QUOTES.has(character) && canCloseString(withoutTransportCharacters, index)) {
        normalized += '"'; quote = null; changed = true; repairedSmartPunctuation = true; continue;
      }
      normalized += character; continue;
    }
    if ((character === '"' || SMART_DOUBLE_QUOTES.has(character)) && canOpenString(withoutTransportCharacters, index)) {
      normalized += '"'; quote = "double"; nestedSmartQuotes = 0; if (character !== '"') { changed = true; repairedSmartPunctuation = true; } continue;
    }
    if (SMART_SINGLE_QUOTES.has(character) && canOpenString(withoutTransportCharacters, index)) {
      normalized += '"'; quote = "single"; changed = true; repairedSmartPunctuation = true; continue;
    }
    if (character === "：") { normalized += ":"; changed = true; repairedSmartPunctuation = true; continue; }
    if (character === "，") { normalized += ","; changed = true; repairedSmartPunctuation = true; continue; }
    if (character === "\uFEFF") { changed = true; continue; }
    if (character === "\u00A0") { normalized += " "; changed = true; continue; }
    normalized += character;
  }
  return { text: normalized, changed, detectedSmartPunctuation, repairedSmartPunctuation };
}

function findDangerousKey(value: unknown, path = "root"): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findDangerousKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) return `${path}.${key}`;
    const found = findDangerousKey(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function extractCandidate(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("找不到完整的 JSON 物件（缺少 { 或 }）。");
  const candidate = trimmed.slice(start, end + 1);
  const prefix = trimmed.slice(0, start);
  const suffix = trimmed.slice(end + 1);
  if (/[{}]/.test(prefix + suffix)) throw new Error("文字中有多個無法唯一判斷的 JSON 區段。");
  return candidate;
}

function formatZodError(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "JSON";
    return `${path}：${issue.message}`;
  }).join("；");
}

type Token = { text: string; start: number; end: number; depth: number };

// A bounded lexical scan, not an evaluator. Strings are opaque; commas inside them are never repaired.
function tokens(text: string): Token[] {
  const result: Token[] = [];
  let depth = 0;
  for (let i = 0; i < text.length;) {
    if (/\s/.test(text[i])) { i++; continue; }
    const start = i;
    if (text[i] === '"') {
      i++;
      while (i < text.length) { if (text[i] === "\\") { i += 2; continue; } if (text[i++] === '"') break; }
    } else if (/[{}\[\],:]/.test(text[i])) i++;
    else { while (i < text.length && !/[\s{}\[\],:"]/.test(text[i])) i++; }
    const value = text.slice(start, i);
    if (value === "}" || value === "]") depth--;
    result.push({ text: value, start, end: i, depth });
    if (value === "{" || value === "[") depth++;
  }
  return result;
}

function repairSyntax(text: string, changes: string[]): string {
  const list = tokens(text);
  const edits: { start: number; end: number; value: string }[] = [];
  for (let i = 0; i < list.length; i++) {
    const token = list[i], next = list[i + 1];
    if (token.depth === 1 && token.text === '"warnings"' && next?.text === ":" && [",", "}"].includes(list[i + 2]?.text)) {
      edits.push({ start: next.end, end: next.end, value: " []" }); changes.push("warnings 缺值 → []（不新增警告內容）");
    }
    if (token.text === "," && next && ["}", "]"].includes(next.text)) {
      const previous = list[i - 1]?.text;
      // Do not interpret array holes, double commas, or missing amounts as trailing commas.
      if (previous && !["[", "{", ":", ","].includes(previous)) {
        edits.push({ start: token.start, end: token.end, value: "" }); changes.push(`移除結尾逗號（位置 ${token.start + 1}）`);
      }
    }
  }
  return edits.sort((a, b) => b.start - a.start).reduce((value, edit) => value.slice(0, edit.start) + edit.value + value.slice(edit.end), text);
}

function errorLocation(text: string, reason: string): string {
  const position = reason.match(/position (\d+)/i);
  const nativeLine = reason.match(/line (\d+) column (\d+)/i);
  if (nativeLine) return `第 ${nativeLine[1]} 行，第 ${nativeLine[2]} 欄；${reason}`;
  const list = tokens(text);
  const missing = list.findIndex((token, i) => token.text === ":" && [",", "}", "]"].includes(list[i + 1]?.text));
  const offset = position ? Number(position[1]) : missing >= 0 ? list[missing + 1].start : text.length;
  const before = text.slice(0, offset);
  return `第 ${before.split("\n").length} 行，第 ${offset - before.lastIndexOf("\n")} 欄${missing >= 0 ? "（欄位缺少值，不可猜測補值）" : "（若引擎未提供位置，標示最後可檢查位置）"}；${reason}`;
}

export function parseChatGPTImport(raw: string): ImportParseResult { return parseImport(raw, false); }
export function repairChatGPTImport(raw: string): ImportParseResult { return parseImport(raw, true); }

function parseImport(raw: string, repair: boolean): ImportParseResult {
  if (!raw.trim()) return { data: null, error: "請先貼上 ChatGPT JSON。", notice: null };
  if (raw.length > CHATGPT_IMPORT_MAX_LENGTH) {
    return { data: null, error: `內容過長，最多允許 ${CHATGPT_IMPORT_MAX_LENGTH.toLocaleString()} 個字元。`, notice: null };
  }
  try {
    const candidate = extractCandidate(raw);
    const changes: string[] = [];
    // Repair ASCII syntax first so an unrelated trailing comma cannot cause valid string text to be reinterpreted.
    const normalized = normalizeChatGPTJsonPunctuation(repair ? repairSyntax(candidate, changes) : candidate);
    if (normalized.changed) changes.push("正規化 JSON 結構標點／傳輸空白（保留字串內容）");
    const text = repair ? repairSyntax(normalized.text, changes) : normalized.text;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      const reason = error instanceof SyntaxError ? error.message : "未知 JSON 錯誤";
      const attempted = normalized.detectedSmartPunctuation ? "已偵測到智慧引號或全形標點並嘗試自動修正。" : "";
      return { data: null, error: `${attempted}內容不是有效 JSON。請確認 ChatGPT 使用英文半形雙引號。錯誤位置：${errorLocation(text, reason)}。請在原始輸入中手動編輯；系統不會猜測商品或金額。`, notice: null };
    }
    const dangerousPath = findDangerousKey(value);
    if (dangerousPath) return { data: null, error: `JSON 含有不安全欄位：${dangerousPath}`, notice: null };
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const object = value as Record<string, unknown>;
      if (repair) {
        for (const key of ["items", "adjustments"]) {
          if (object[key] && typeof object[key] === "object" && !Array.isArray(object[key])) { object[key] = [object[key]]; changes.push(`${key}：單一物件 → 單元素陣列`); }
        }
        if (object.warnings === null) { object.warnings = []; changes.push("warnings: null → []"); }
      }
      if (!("warnings" in object)) { object.warnings = []; changes.push("缺少 warnings → []"); }
      if (!("adjustments" in object)) {
        // Unknown adjustment fields are rejected by the strict schema too. Never erase evidence of a discount/deposit.
        const hints = /pfand|rabatt|coupon|discount|deposit|折扣|押金|調整/i;
        if (hints.test(JSON.stringify(object))) return { data: null, error: "adjustments 缺少，但內容可能包含折扣、押金或調整資訊。請手動確認並填入 adjustments；系統不會推測調整金額。", notice: null };
        object.adjustments = []; changes.push("缺少 adjustments，未偵測到調整資訊 → []（仍須人工核對）");
      }
    }
    const validated = chatGPTImportSchema.safeParse(value);
    if (!validated.success) return { data: null, error: `資料驗證失敗：${formatZodError(validated.error)}`, notice: null };
    return { data: validated.data, error: null, notice: normalized.repairedSmartPunctuation ? SMART_PUNCTUATION_NOTICE : changes.length ? "已修復格式，請核對差異後確認。" : null,
      changes, repairedText: changes.length ? JSON.stringify(value, null, 2) : undefined };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "無法解析貼上的內容。", notice: null };
  }
}
