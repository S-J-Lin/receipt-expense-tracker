import "server-only";
import { requireAuthorizedUser } from "@/lib/auth";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidReceiptPath, RECEIPT_BUCKET, validateReceiptFile } from "@/lib/receipt-validation";

export async function createReceiptSignedUrl(path: string | null | undefined): Promise<string | null> {
  await requireAuthorizedUser();
  if (!isValidReceiptPath(path)) return null;
  const { data, error } = await (await createServerSupabaseClient()).storage.from(RECEIPT_BUCKET).createSignedUrl(path, 60 * 60);
  return error ? null : data.signedUrl;
}

export async function verifyUploadedReceipt(path: string): Promise<string | null> {
  await requireAuthorizedUser();
  if (!isValidReceiptPath(path)) return "收據路徑無效。";
  const { data, error } = await (await createServerSupabaseClient()).storage.from(RECEIPT_BUCKET).download(path);
  if (error) return `無法驗證已上傳收據：${error.message}`;
  const name = path.split("/").pop() ?? "receipt";
  const file = new File([data], name, { type: data.type });
  const validation = await validateReceiptFile(file);
  if (!validation.data) {
    await removeReceiptIfUnreferenced(path);
    return validation.error;
  }
  return null;
}

export async function removeReceipt(path: string | null | undefined): Promise<string | null> {
  await requireAuthorizedUser();
  if (!path) return null;
  if (!isValidReceiptPath(path)) return "收據路徑無效，未執行圖片清理。";
  const { error } = await (await createServerSupabaseClient()).storage.from(RECEIPT_BUCKET).remove([path]);
  return error ? `收據圖片清理失敗：${error.message}` : null;
}

/**
 * Compensating / cleanup delete that refuses to remove a file still in use.
 * - Only paths under the owner's own prefix are removed, unless
 *   `allowLegacyPrefix` is set (legacy `anonymous/` receipts of a deleted expense).
 * - A file referenced by any expense other than `exceptExpenseId` is kept.
 * Returns an error message only when a permitted delete failed.
 */
export async function removeReceiptIfUnreferenced(path: string | null | undefined, options: { exceptExpenseId?: string; allowLegacyPrefix?: boolean } = {}): Promise<string | null> {
  const userId = await requireAuthorizedUser();
  if (!path) return null;
  if (!isValidReceiptPath(path)) return "收據路徑無效，未執行圖片清理。";
  const ownPrefix = path.startsWith(`${userId}/`);
  if (!ownPrefix && !(options.allowLegacyPrefix && path.startsWith("anonymous/"))) return null;
  const supabase = await createServerSupabaseClient();
  let query = supabase.from("expenses").select("id", { count: "exact", head: true }).eq("receipt_image_path", path);
  if (options.exceptExpenseId) query = query.neq("id", options.exceptExpenseId);
  const { count, error } = await query;
  if (error) return "無法確認收據是否仍被使用，已保留檔案。";
  if ((count ?? 0) > 0) return null;
  return removeReceipt(path);
}
