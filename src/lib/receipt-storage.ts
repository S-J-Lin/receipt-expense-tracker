import "server-only";

import { createSupabaseClient } from "@/lib/supabase/client";
import { isValidReceiptPath, RECEIPT_BUCKET, validateReceiptFile } from "@/lib/receipt-validation";

export async function createReceiptSignedUrl(path: string | null | undefined): Promise<string | null> {
  if (!isValidReceiptPath(path)) return null;
  const { data, error } = await createSupabaseClient().storage.from(RECEIPT_BUCKET).createSignedUrl(path, 60 * 60);
  return error ? null : data.signedUrl;
}

export async function verifyUploadedReceipt(path: string): Promise<string | null> {
  if (!isValidReceiptPath(path)) return "收據路徑無效。";
  const { data, error } = await createSupabaseClient().storage.from(RECEIPT_BUCKET).download(path);
  if (error) return `無法驗證已上傳收據：${error.message}`;
  const name = path.split("/").pop() ?? "receipt";
  const file = new File([data], name, { type: data.type });
  const validation = await validateReceiptFile(file);
  if (!validation.data) {
    await removeReceipt(path);
    return validation.error;
  }
  return null;
}

export async function removeReceipt(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (!isValidReceiptPath(path)) return "收據路徑無效，未執行圖片清理。";
  const { error } = await createSupabaseClient().storage.from(RECEIPT_BUCKET).remove([path]);
  return error ? `收據圖片清理失敗：${error.message}` : null;
}
