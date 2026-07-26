import { chatGPTImportSchema } from "@/lib/chatgpt-import-schema";
import type { ChatGPTImport } from "@/types/chatgpt-import";

export const CHATGPT_IMPORT_MAX_LENGTH = 100_000;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export type ImportParseResult =
  | { data: ChatGPTImport; error: null; notice: string | null }
  | { data: null; error: string; notice: null };

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
  const withoutTransportCharacters = candidate.replaceAll("\uFEFF", "").replaceAll("\u00A0", " ");
  let changed = withoutTransportCharacters !== candidate;
  const detectedSmartPunctuation = /[“”＂‘’：，]/.test(candidate);
  let repairedSmartPunctuation = false;
  let quote: "double" | "single" | null = null;
  let escaped = false;
  let normalized = "";

  for (let index = 0; index < withoutTransportCharacters.length; index += 1) {
    const character = withoutTransportCharacters[index];
    if (quote === "double") {
      if (escaped) { normalized += character; escaped = false; continue; }
      if (character === "\\") { normalized += character; escaped = true; continue; }
      if ((character === '"' || SMART_DOUBLE_QUOTES.has(character)) && canCloseString(withoutTransportCharacters, index)) {
        normalized += '"'; quote = null; if (character !== '"') { changed = true; repairedSmartPunctuation = true; } continue;
      }
      if (SMART_DOUBLE_QUOTES.has(character)) {
        normalized += '\\"'; changed = true; repairedSmartPunctuation = true; continue;
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
      normalized += '"'; quote = "double"; if (character !== '"') { changed = true; repairedSmartPunctuation = true; } continue;
    }
    if (SMART_SINGLE_QUOTES.has(character) && canOpenString(withoutTransportCharacters, index)) {
      normalized += '"'; quote = "single"; changed = true; repairedSmartPunctuation = true; continue;
    }
    if (character === "：") { normalized += ":"; changed = true; repairedSmartPunctuation = true; continue; }
    if (character === "，") { normalized += ","; changed = true; repairedSmartPunctuation = true; continue; }
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

export function parseChatGPTImport(raw: string): ImportParseResult {
  if (!raw.trim()) return { data: null, error: "請先貼上 ChatGPT JSON。", notice: null };
  if (raw.length > CHATGPT_IMPORT_MAX_LENGTH) {
    return { data: null, error: `內容過長，最多允許 ${CHATGPT_IMPORT_MAX_LENGTH.toLocaleString()} 個字元。`, notice: null };
  }
  try {
    const candidate = extractCandidate(raw);
    const normalized = normalizeChatGPTJsonPunctuation(candidate);
    let value: unknown;
    try {
      value = JSON.parse(normalized.text);
    } catch (error) {
      const reason = error instanceof SyntaxError ? error.message : "未知 JSON 錯誤";
      const attempted = normalized.detectedSmartPunctuation ? "已偵測到智慧引號或全形標點並嘗試自動修正。" : "";
      return { data: null, error: `${attempted}內容不是有效 JSON。請確認 ChatGPT 使用英文半形雙引號。錯誤位置：${reason}`, notice: null };
    }
    const dangerousPath = findDangerousKey(value);
    if (dangerousPath) return { data: null, error: `JSON 含有不安全欄位：${dangerousPath}`, notice: null };
    const validated = chatGPTImportSchema.safeParse(value);
    if (!validated.success) return { data: null, error: `資料驗證失敗：${formatZodError(validated.error)}`, notice: null };
    return { data: validated.data, error: null, notice: normalized.repairedSmartPunctuation ? SMART_PUNCTUATION_NOTICE : null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "無法解析貼上的內容。", notice: null };
  }
}
