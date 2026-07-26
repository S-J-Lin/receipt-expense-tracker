import { chatGPTImportSchema } from "@/lib/chatgpt-import-schema";
import type { ChatGPTImport } from "@/types/chatgpt-import";

export const CHATGPT_IMPORT_MAX_LENGTH = 100_000;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export type ImportParseResult =
  | { data: ChatGPTImport; error: null }
  | { data: null; error: string };

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
  if (!raw.trim()) return { data: null, error: "請先貼上 ChatGPT JSON。" };
  if (raw.length > CHATGPT_IMPORT_MAX_LENGTH) {
    return { data: null, error: `內容過長，最多允許 ${CHATGPT_IMPORT_MAX_LENGTH.toLocaleString()} 個字元。` };
  }
  try {
    const candidate = extractCandidate(raw);
    let value: unknown;
    try {
      value = JSON.parse(candidate);
    } catch (error) {
      const reason = error instanceof SyntaxError ? error.message : "未知 JSON 錯誤";
      return { data: null, error: `JSON 格式錯誤：${reason}` };
    }
    const dangerousPath = findDangerousKey(value);
    if (dangerousPath) return { data: null, error: `JSON 含有不安全欄位：${dangerousPath}` };
    const validated = chatGPTImportSchema.safeParse(value);
    if (!validated.success) return { data: null, error: `資料驗證失敗：${formatZodError(validated.error)}` };
    return { data: validated.data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "無法解析貼上的內容。" };
  }
}
