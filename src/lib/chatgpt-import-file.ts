import { CHATGPT_IMPORT_MAX_LENGTH } from "@/lib/chatgpt-import-parser";

export const CHATGPT_IMPORT_FILE_MAX_BYTES = CHATGPT_IMPORT_MAX_LENGTH * 4;
type JsonFile = Pick<File, "name" | "size" | "arrayBuffer">;
export async function readChatGPTJsonFile(file: JsonFile): Promise<{ text: string; error: null } | { text: null; error: string }> {
  if (!/\.json$/i.test(file.name)) return { text: null, error: "請選擇副檔名為 .json 的檔案。" };
  if (file.size > CHATGPT_IMPORT_FILE_MAX_BYTES) return { text: null, error: "JSON 檔案過大，最多 400 KB；內容仍限制為 100,000 個字元。" };
  try {
    // Fail closed for invalid UTF-8 instead of silently replacing product text.
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
    if (text.length > CHATGPT_IMPORT_MAX_LENGTH) return { text: null, error: "JSON 內容過長，最多 100,000 個字元。" };
    return { text, error: null };
  } catch {
    return { text: null, error: "無法讀取檔案。請確認檔案已下載到 iPhone、使用 UTF-8 編碼，或改用貼上 JSON。" };
  }
}
