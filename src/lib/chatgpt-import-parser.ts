import { chatGPTImportItemSchema, chatGPTImportSchema } from "@/lib/chatgpt-import-schema";
import { normalizeMarkdownEscapes, repairDifference, type ImportRepairRecord } from "@/lib/chatgpt-import-normalization";
import type { ChatGPTImport } from "@/types/chatgpt-import";

export const CHATGPT_IMPORT_MAX_LENGTH = 100_000;
/** Receipts are about three levels deep; anything far deeper is not a receipt. */
export const CHATGPT_IMPORT_MAX_DEPTH = 16;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Where a JSON problem is, with nearby text, independent of the browser's JSON engine. */
export type ImportErrorLocation = { line: number; column: number; before: string; after: string; normalized: boolean };

export type ImportParseResult =
  | { data: ChatGPTImport; error: null; notice: string | null; repairedText?: string; changes?: string[]; records?: ImportRepairRecord[]; location?: undefined }
  | { data: null; error: string; notice: null; repairedText?: undefined; changes?: undefined; records?: undefined; location?: ImportErrorLocation };

export const SMART_PUNCTUATION_NOTICE = "已自動修正 ChatGPT 輸出中的智慧引號與全形標點。";
const SMART_DOUBLE_QUOTES = new Set(["“", "”", "＂"]);
const SMART_SINGLE_QUOTES = new Set(["‘", "’"]);
const STRING_START_CONTEXT = new Set(["{", "[", ",", ":", "，", "："]);
const STRING_END_CONTEXT = new Set([":", ",", "}", "]"]);

type NormalizedCandidate = { text: string; changed: boolean; detectedSmartPunctuation: boolean; repairedSmartPunctuation: boolean; records: ImportRepairRecord[] };

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
  if (next === "\\") {
    const suffix = value.slice(index + 1).trimStart();
    if (/^\\[\]}]/.test(suffix)) return true;
  }
  return next === "" || STRING_END_CONTEXT.has(next) || next === "：" || next === "，";
}

export function normalizeChatGPTJsonPunctuation(candidate: string): NormalizedCandidate {
  // Valid JSON is authoritative: never rewrite Unicode inside its string values.
  try { JSON.parse(candidate); return { text: candidate, changed: false, detectedSmartPunctuation: false, repairedSmartPunctuation: false, records: [] }; } catch { /* Scan invalid input only. */ }
  const withoutTransportCharacters = candidate;
  let changed = false;
  const detectedSmartPunctuation = /[“”＂‘’：，]/.test(candidate);
  let repairedSmartPunctuation = false;
  let quote: "double" | "single" | null = null;
  let escaped = false;
  let nestedSmartQuotes = 0;
  let normalized = "";
  const records: ImportRepairRecord[] = [];
  const record = (index: number, after: string, type = "智慧引號／全形標點") => records.push({ type, count: 1, before: candidate.slice(Math.max(0, index - 16), index + 17), after: candidate.slice(Math.max(0, index - 16), index) + after + candidate.slice(index + 1, index + 17) });

  for (let index = 0; index < withoutTransportCharacters.length; index += 1) {
    const character = withoutTransportCharacters[index];
    if (quote === null && character === '"' && canOpenString(withoutTransportCharacters, index)) {
      let end = index + 1;
      while (end < candidate.length) { if (candidate[end] === "\\") { end += 2; continue; } if (candidate[end] === '"') break; end++; }
      let validToken = false;
      try { validToken = typeof JSON.parse(candidate.slice(index, end + 1)) === "string"; } catch { /* Mixed delimiters or Markdown escapes need the conservative scanner. */ }
      if (["{", ",", "，"].includes(previousSignificant(candidate, index)) && /[”＂]\s*[:：]/.test(candidate.slice(index + 1, end))) validToken = false;
      if (validToken && end < candidate.length && canCloseString(candidate, end)) {
        // An ASCII-delimited string remains opaque even if other structure is invalid.
        normalized += candidate.slice(index, end + 1); index = end; continue;
      }
    }
    if (quote === "double") {
      if (escaped) { normalized += character; escaped = false; continue; }
      if (character === "\\") { normalized += character; escaped = true; continue; }
      if (character === "“") { nestedSmartQuotes++; normalized += character; continue; }
      if (character === "”" && nestedSmartQuotes > 0) { nestedSmartQuotes--; normalized += character; continue; }
      if (character === '"' || (SMART_DOUBLE_QUOTES.has(character) && canCloseString(withoutTransportCharacters, index))) {
        normalized += '"'; quote = null; if (character !== '"') { changed = true; repairedSmartPunctuation = true; record(index, '"'); } continue;
      }
      normalized += character; continue;
    }
    if (quote === "single") {
      if (SMART_SINGLE_QUOTES.has(character) && canCloseString(withoutTransportCharacters, index)) {
        normalized += '"'; quote = null; changed = true; repairedSmartPunctuation = true; record(index, '"'); continue;
      }
      normalized += character; continue;
    }
    if ((character === '"' || SMART_DOUBLE_QUOTES.has(character)) && canOpenString(withoutTransportCharacters, index)) {
      normalized += '"'; quote = "double"; nestedSmartQuotes = 0; if (character !== '"') { changed = true; repairedSmartPunctuation = true; record(index, '"'); } continue;
    }
    if (SMART_SINGLE_QUOTES.has(character) && canOpenString(withoutTransportCharacters, index)) {
      normalized += '"'; quote = "single"; changed = true; repairedSmartPunctuation = true; record(index, '"'); continue;
    }
    if (character === "：") { normalized += ":"; changed = true; repairedSmartPunctuation = true; record(index, ":"); continue; }
    if (character === "，") { normalized += ","; changed = true; repairedSmartPunctuation = true; record(index, ","); continue; }
    if (character === "\uFEFF") { changed = true; record(index, "", "移除結構外 BOM"); continue; }
    if (character === "\u00A0") { normalized += " "; changed = true; record(index, " ", "結構外不換行空白"); continue; }
    normalized += character;
  }
  return { text: normalized, changed, detectedSmartPunctuation, repairedSmartPunctuation, records };
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
  if (trimmed.startsWith("\\{") && trimmed.endsWith("\\}")) return trimmed;
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

// A bounded lexical scan, not an evaluator. Strings are opaque, so commas or
// brackets inside them are never repaired. With `smartAware`, a string that
// opens with a smart quote in a value/key position is also consumed as one
// opaque token (closing at a smart or ASCII quote followed by : , } ] or end).
const SMART_OPEN = new Set(["“", "＂", "‘"]);
const SMART_CLOSE: Record<string, string[]> = { "“": ["”", "＂", '"'], "＂": ["＂", "”", '"'], "‘": ["’"] };
const OPEN_CONTEXT = new Set(["{", "[", ",", ":", "，", "："]);
function closesHere(text: string, index: number): boolean {
  for (let cursor = index + 1; cursor < text.length; cursor += 1) {
    if (/\s/.test(text[cursor])) continue;
    return [":", ",", "}", "]", "：", "，"].includes(text[cursor]);
  }
  return true;
}
function tokens(text: string, smartAware = false): Token[] {
  const result: Token[] = [];
  let depth = 0;
  for (let i = 0; i < text.length;) {
    if (/\s/.test(text[i])) { i++; continue; }
    const start = i;
    const previous = result[result.length - 1]?.text;
    if (text[i] === '"') {
      i++;
      while (i < text.length) { if (text[i] === "\\") { i += 2; continue; } if (text[i++] === '"') break; }
    } else if (smartAware && SMART_OPEN.has(text[i]) && (previous === undefined || OPEN_CONTEXT.has(previous))) {
      const closers = SMART_CLOSE[text[i]];
      i++;
      while (i < text.length && !(closers.includes(text[i]) && closesHere(text, i))) i++;
      i = Math.min(i + 1, text.length);
    } else if (/[{}\[\],:，：]/.test(text[i])) i++;
    else { while (i < text.length && !/[\s{}\[\],:"，：]/.test(text[i])) i++; }
    const value = text.slice(start, i);
    if (value === "}" || value === "]") depth--;
    result.push({ text: value, start, end: i, depth });
    if (value === "{" || value === "[") depth++;
  }
  return result;
}

const BARE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MISSING_VALUE_DEFAULTS: Record<string, { value: string; change: string }> = {
  '"warnings"': { value: " []", change: "warnings 缺值 → []（不新增警告內容）" },
  '"adjustments"': { value: " []", change: "adjustments 缺值 → []（未發現折扣／押金線索時才允許；仍須人工核對）" },
};

type RepairFlags = { adjustmentsFilled: boolean };

function repairSyntax(text: string, changes: string[], flags: RepairFlags, smartAware = false, records?: ImportRepairRecord[]): string {
  const list = tokens(text, smartAware);
  const edits: { start: number; end: number; value: string }[] = [];
  for (let i = 0; i < list.length; i++) {
    const token = list[i], next = list[i + 1], previous = list[i - 1];
    const fill = MISSING_VALUE_DEFAULTS[token.text];
    if (fill && token.depth === 1 && next?.text === ":" && [",", "}"].includes(list[i + 2]?.text)) {
      edits.push({ start: next.end, end: next.end, value: fill.value }); changes.push(fill.change);
      records?.push({ type: fill.change, count: 1, before: text.slice(token.start, list[i + 2].end), after: `${token.text}: []${list[i + 2].text}` });
      if (token.text === '"adjustments"') flags.adjustmentsFilled = true;
    }
    // Unquoted ASCII property names such as {merchant: "dm"} → {"merchant": "dm"}.
    if (BARE_KEY.test(token.text) && next?.text === ":" && (previous?.text === "{" || previous?.text === ",")) {
      edits.push({ start: token.start, end: token.end, value: `"${token.text}"` }); changes.push(`欄位名稱 ${token.text} 補上雙引號`);
      records?.push({ type: "欄位補上雙引號", count: 1, before: token.text, after: `"${token.text}"` });
    }
    if ((token.text === "," || token.text === "，") && next && ["}", "]"].includes(next.text)) {
      // Do not interpret array holes, double commas, or missing amounts as trailing commas.
      if (previous && !["[", "{", ":", ",", "：", "，"].includes(previous.text)) {
        edits.push({ start: token.start, end: token.end, value: "" }); changes.push(`移除結尾逗號（位置 ${token.start + 1}）`);
        records?.push({ type: "移除結尾逗號", count: 1, before: text.slice(previous.start, next.end).slice(-120), after: (text.slice(previous.start, token.start) + text.slice(token.end, next.end)).slice(-120) });
      }
    }
  }
  return edits.sort((a, b) => b.start - a.start).reduce((value, edit) => value.slice(0, edit.start) + edit.value + value.slice(edit.end), text);
}

type ScanIssue = { offset: number; message: string; kind: "syntax" | "duplicate" | "depth" };

/**
 * Strict RFC 8259 structure check used for error reporting, duplicate keys and
 * nesting depth. It does not evaluate anything and stops at the first problem.
 * Recursion is bounded by `maxDepth`.
 */
export function scanJson(text: string, maxDepth = CHATGPT_IMPORT_MAX_DEPTH): ScanIssue | null {
  let i = 0;
  const fail = (message: string, offset = i, kind: ScanIssue["kind"] = "syntax"): never => { throw { offset, message, kind } satisfies ScanIssue; };
  const whitespace = () => { while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i++; };
  const string = (): string => {
    const start = i; i++;
    while (i < text.length) {
      const character = text[i];
      if (character === "\\") {
        const escaped = text[i + 1];
        if (!escaped || !'"\\/bfnrtu'.includes(escaped)) fail("字串含有不合法跳脫字元；請使用「嘗試修復 JSON」或保留反斜線為 \\\\", i);
        if (escaped === "u" && !/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail("Unicode 跳脫必須包含四位十六進位數字", i);
        i += escaped === "u" ? 6 : 2; continue;
      }
      if (character === '"') { i++; return text.slice(start, i); }
      if (character < " ") fail("字串中有未跳脫的換行或控制字元", i);
      i++;
    }
    return fail("字串缺少結尾的英文雙引號", start);
  };
  const value = (depth: number): void => {
    whitespace();
    const character = text[i];
    if (character === "{") return object(depth + 1);
    if (character === "[") return array(depth + 1);
    if (character === '"') { string(); return; }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i, i + 40));
    if (number) { i += number[0].length; return; }
    for (const literal of ["true", "false", "null"]) if (text.startsWith(literal, i)) { i += literal.length; return; }
    if (i >= text.length) fail("內容提前結束（缺少值或右括號）");
    if (character === "," || character === "}" || character === "]") fail("這裡缺少值（系統不會猜測補值）");
    fail(`無法辨識「${text.slice(i, i + 12)}」：文字必須用英文雙引號包住，數字不可含單位或逗號`);
  };
  const object = (depth: number): void => {
    if (depth > maxDepth) fail(`巢狀層數超過 ${maxDepth} 層`, i, "depth");
    i++; whitespace();
    if (text[i] === "}") { i++; return; }
    const keys = new Set<string>();
    for (;;) {
      whitespace();
      if (text[i] !== '"') fail(text[i] === "}" ? "右大括號 } 前多了一個逗號" : "欄位名稱必須用英文雙引號包住");
      const keyStart = i;
      const raw = string();
      let key: string;
      try { key = JSON.parse(raw) as string; } catch { return fail("欄位名稱含有無效的跳脫字元", keyStart); }
      if (keys.has(key)) fail(`重複的欄位「${key}」：同一層不可出現兩次，系統不會自行選擇其中一個值`, keyStart, "duplicate");
      keys.add(key);
      whitespace();
      if (text[i] !== ":") fail("欄位名稱後缺少冒號 :");
      i++;
      value(depth);
      whitespace();
      if (text[i] === ",") { i++; continue; }
      if (text[i] === "}") { i++; return; }
      fail(i >= text.length ? "缺少右大括號 }" : "欄位之間缺少逗號，或多了無法辨識的文字");
    }
  };
  const array = (depth: number): void => {
    if (depth > maxDepth) fail(`巢狀層數超過 ${maxDepth} 層`, i, "depth");
    i++; whitespace();
    if (text[i] === "]") { i++; return; }
    for (;;) {
      whitespace();
      if (text[i] === "]") fail("右中括號 ] 前多了一個逗號");
      value(depth);
      whitespace();
      if (text[i] === ",") { i++; continue; }
      if (text[i] === "]") { i++; return; }
      fail(i >= text.length ? "缺少右中括號 ]" : "陣列項目之間缺少逗號");
    }
  };
  try {
    value(0);
    whitespace();
    if (i < text.length) fail("JSON 結束後還有多餘的文字");
    return null;
  } catch (error) {
    if (error && typeof error === "object" && "offset" in error) return error as ScanIssue;
    throw error;
  }
}

export function locate(text: string, offset: number, normalized: boolean): ImportErrorLocation {
  const safe = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, safe);
  const lineStart = before.lastIndexOf("\n") + 1;
  return {
    line: before.split("\n").length,
    column: safe - lineStart + 1,
    before: text.slice(Math.max(lineStart, safe - 40), safe),
    after: text.slice(safe, Math.min(text.length, safe + 40)).split("\n")[0],
    normalized,
  };
}

export function parseChatGPTImport(raw: string): ImportParseResult { return parseImport(raw, false); }
export function repairChatGPTImport(raw: string): ImportParseResult { return parseImport(raw, true); }

const ADJUSTMENT_HINTS = /pfand|rabatt|coupon|discount|deposit|折扣|押金|調整/i;

/** Only adjacent, complete, individually validated item objects may become an array. */
function repairAdjacentItems(text: string, changes: string[], records: ImportRepairRecord[]): string {
  const list = tokens(text);
  for (let index = 0; index < list.length; index++) {
    if (list[index].text !== '"items"' || list[index].depth !== 1 || list[index + 1]?.text !== ":" || list[index + 2]?.text !== "{") continue;
    const start = list[index + 2].start;
    let cursor = index + 2, end = start, count = 0;
    while (list[cursor]?.text === "{") {
      const opening = list[cursor];
      let closing = cursor + 1;
      while (closing < list.length && !(list[closing].text === "}" && list[closing].depth === opening.depth)) closing++;
      if (closing === list.length) return text;
      const fragment = text.slice(opening.start, list[closing].end);
      if (scanJson(fragment)) return text;
      let value: unknown;
      try { value = JSON.parse(fragment); } catch { return text; }
      if (findDangerousKey(value) || !chatGPTImportItemSchema.safeParse(value).success) return text;
      count++; end = list[closing].end; cursor = closing + 1;
      if (list[cursor]?.text === "," && list[cursor + 1]?.text === "{") cursor++;
      else break;
    }
    if (count < 2 || !(list[cursor]?.text === "}" || (list[cursor]?.text === "," && list[cursor + 1]?.text.startsWith('"') && list[cursor + 2]?.text === ":"))) return text;
    const after = text.slice(0, start) + "[" + text.slice(start, end) + "]" + text.slice(end);
    const type = `items：${count} 個連續商品物件 → 陣列（全部保留）`;
    changes.push(type); records.push(repairDifference(type, text, after)); return after;
  }
  return text;
}

function parseImport(raw: string, repair: boolean): ImportParseResult {
  if (!raw.trim()) return { data: null, error: "請先貼上 ChatGPT JSON。", notice: null };
  if (raw.length > CHATGPT_IMPORT_MAX_LENGTH) {
    return { data: null, error: `內容過長，最多允許 ${CHATGPT_IMPORT_MAX_LENGTH.toLocaleString()} 個字元。`, notice: null };
  }
  try {
    const candidate = extractCandidate(raw);
    const changes: string[] = [];
    const records: ImportRepairRecord[] = [];
    const flags: RepairFlags = { adjustmentsFilled: false };
    // Repair syntax first (smart-quote aware) so an unrelated trailing comma
    // cannot cause valid string text to be reinterpreted by the normalizer.
    const firstPass = repair ? repairSyntax(candidate, changes, flags, true, records) : candidate;
    const normalized = normalizeChatGPTJsonPunctuation(firstPass);
    if (normalized.changed) changes.push("正規化 JSON 結構標點／傳輸空白（保留字串內容）");
    records.push(...normalized.records);
    const markdown = repair ? normalizeMarkdownEscapes(normalized.text) : { text: normalized.text, records: [] };
    records.push(...markdown.records);
    changes.push(...markdown.records.map((record) => record.type));
    const syntax = repair ? repairSyntax(markdown.text, changes, flags, false, records) : markdown.text;
    const text = repair ? repairAdjacentItems(syntax, changes, records) : syntax;
    const issue = scanJson(text);
    if (issue) {
      const location = locate(text, issue.offset, text !== candidate);
      const attempted = normalized.detectedSmartPunctuation ? "已偵測到智慧引號或全形標點並嘗試自動修正。" : "";
      const missingItems = issue.kind === "syntax" && /"items"\s*:\s*$/.test(text.slice(0, issue.offset));
      const prefix = issue.kind === "syntax" ? `${attempted}內容不是有效 JSON。${repair ? "JSON 格式錯誤，無法安全修復。" : ""}${missingItems ? "items 缺少值，商品資料可能不完整；請人工補回商品，不得直接儲存。" : ""}` : "JSON 內容無法安全匯入。";
      const advice = issue.kind === "syntax" ? (repair ? "請在原始輸入中手動修正；系統不會猜測商品或金額。" : "可先按「嘗試修復 JSON」，或在原始輸入中手動修正。") : "請在 ChatGPT 重新產生或手動修正。";
      return { data: null, error: `${prefix}錯誤位置：第 ${location.line} 行，第 ${location.column} 欄——${issue.message}。${advice}`, notice: null, location };
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      const reason = error instanceof SyntaxError ? error.message : "未知 JSON 錯誤";
      return { data: null, error: `內容不是有效 JSON：${reason}`, notice: null };
    }
    const dangerousPath = findDangerousKey(value);
    if (dangerousPath) return { data: null, error: `JSON 含有不安全欄位：${dangerousPath}`, notice: null };
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const object = value as Record<string, unknown>;
      if (repair) {
        for (const key of ["items", "adjustments"]) {
          if (object[key] && typeof object[key] === "object" && !Array.isArray(object[key])) {
            const before = JSON.stringify(object[key]);
            object[key] = [object[key]]; changes.push(`${key}：單一物件 → 單元素陣列`);
            records.push({ type: `${key}：單一物件 → 陣列`, count: 1, before: before.slice(0, 120), after: `[${before}]`.slice(0, 120) });
          }
        }
        if (object.warnings === null) { object.warnings = []; changes.push("warnings: null → []"); records.push({ type: "warnings 空值", count: 1, before: '"warnings": null', after: '"warnings": []' }); }
      }
      if (!("warnings" in object)) { object.warnings = []; changes.push("缺少 warnings → []"); records.push({ type: "缺少 warnings", count: 1, before: "（未提供）", after: '"warnings": []' }); }
      const adjustmentsMissing = !("adjustments" in object);
      if (adjustmentsMissing || flags.adjustmentsFilled) {
        // Never erase evidence of a discount/deposit by inventing an empty list.
        const evidence = { ...object, adjustments: undefined };
        if (ADJUSTMENT_HINTS.test(JSON.stringify(evidence))) return { data: null, error: "adjustments 缺少或沒有值，但內容可能包含折扣、押金或調整資訊。請手動確認並填入 adjustments；系統不會推測調整金額。", notice: null };
        if (adjustmentsMissing) { object.adjustments = []; changes.push("缺少 adjustments，未偵測到調整資訊 → []（仍須人工核對）"); records.push({ type: "缺少 adjustments（須人工核對）", count: 1, before: "（未提供）", after: '"adjustments": []' }); }
      }
    }
    const validated = chatGPTImportSchema.safeParse(value);
    if (!validated.success) return { data: null, error: `資料驗證失敗：${formatZodError(validated.error)}`, notice: null };
    return { data: validated.data, error: null, notice: normalized.repairedSmartPunctuation ? SMART_PUNCTUATION_NOTICE : changes.length ? "已修復格式，請核對差異後確認。" : null,
      changes, records, repairedText: changes.length ? JSON.stringify(value, null, 2) : undefined };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "無法解析貼上的內容。", notice: null, location: locate(raw, raw.length, false) };
  }
}
