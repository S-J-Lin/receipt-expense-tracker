import "server-only";

import { z } from "zod";
import { isValidReceiptPath, RECEIPT_MAX_BYTES } from "@/lib/receipt-validation";
import { createReceiptSessionToken, getReceiptSessionToken, hashReceiptSessionToken, setReceiptSessionCookie } from "@/lib/receipt-session-token";
import { createSupabaseClient } from "@/lib/supabase/client";
import type { ExpenseInsert } from "@/types/expense";
import type { ReceiptUploadSession } from "@/types/receipt-upload-session";

const sessionIdSchema = z.string().uuid();
const uploadMetadataSchema = z.object({
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/heic", "image/heif", "application/pdf"]),
  sizeBytes: z.number().int().positive().max(RECEIPT_MAX_BYTES),
});

export type ReceiptUploadMetadata = z.infer<typeof uploadMetadataSchema>;
type SessionResult = { data: ReceiptUploadSession | null; error: string | null };

async function capabilityHash(sessionId: string) {
  const validId = sessionIdSchema.safeParse(sessionId);
  if (!validId.success) return null;
  const token = await getReceiptSessionToken(validId.data);
  return token ? { sessionId: validId.data, hash: hashReceiptSessionToken(token) } : null;
}

export async function createReceiptUploadSession(path: string, metadata: ReceiptUploadMetadata) {
  const validMetadata = uploadMetadataSchema.safeParse(metadata);
  if (!isValidReceiptPath(path) || !validMetadata.success) return { sessionId: null, error: "收據檔案資料無效。" };
  const token = createReceiptSessionToken();
  const { data, error } = await createSupabaseClient().rpc("create_receipt_upload_session", {
    p_receipt_image_path: path,
    p_original_filename: validMetadata.data.originalFilename,
    p_mime_type: validMetadata.data.mimeType,
    p_size_bytes: validMetadata.data.sizeBytes,
    p_access_token_hash: hashReceiptSessionToken(token),
  });
  if (error || !data) return { sessionId: null, error: `無法建立收據確認工作階段：${error?.message ?? "未取得 ID"}` };
  await setReceiptSessionCookie(data, token);
  return { sessionId: data, error: null };
}

export async function getReceiptUploadSession(sessionId: string): Promise<SessionResult> {
  const capability = await capabilityHash(sessionId);
  if (!capability) return { data: null, error: "找不到收據確認工作階段，或此瀏覽器已失去存取權。" };
  const { data, error } = await createSupabaseClient().rpc("get_receipt_upload_session", {
    p_session_id: capability.sessionId,
    p_access_token_hash: capability.hash,
  });
  if (error) return { data: null, error: `讀取收據確認工作階段失敗：${error.message}` };
  const session = data[0] ?? null;
  if (!session) return { data: null, error: "找不到收據確認工作階段，或此瀏覽器已失去存取權。" };
  if (session.status === "pending" && new Date(session.expires_at).getTime() <= Date.now()) return { data: session, error: "此收據確認工作階段已逾期。" };
  return { data: session, error: null };
}

export async function confirmReceiptUploadSession(sessionId: string, expense: ExpenseInsert) {
  const capability = await capabilityHash(sessionId);
  if (!capability) return { expenseId: null, error: "收據確認工作階段無效。" };
  const { data, error } = await createSupabaseClient().rpc("confirm_receipt_upload_session", {
    p_session_id: capability.sessionId,
    p_access_token_hash: capability.hash,
    p_merchant: expense.merchant,
    p_expense_date: expense.expense_date,
    p_amount: expense.amount,
    p_currency: expense.currency,
    p_category: expense.category,
    p_payment_method: expense.payment_method ?? "",
    p_notes: expense.notes ?? "",
  });
  return error || !data
    ? { expenseId: null, error: `建立消費失敗：${error?.message ?? "未取得消費 ID"}` }
    : { expenseId: data, error: null };
}

export async function replaceReceiptUploadSessionFile(sessionId: string, path: string, metadata: ReceiptUploadMetadata) {
  const capability = await capabilityHash(sessionId);
  const validMetadata = uploadMetadataSchema.safeParse(metadata);
  if (!capability || !isValidReceiptPath(path) || !validMetadata.success) return { oldPath: null, error: "工作階段或收據檔案資料無效。" };
  const { data, error } = await createSupabaseClient().rpc("replace_receipt_upload_session_file", {
    p_session_id: capability.sessionId,
    p_access_token_hash: capability.hash,
    p_receipt_image_path: path,
    p_original_filename: validMetadata.data.originalFilename,
    p_mime_type: validMetadata.data.mimeType,
    p_size_bytes: validMetadata.data.sizeBytes,
  });
  return error || !data ? { oldPath: null, error: `替換暫存收據失敗：${error?.message ?? "未取得原路徑"}` } : { oldPath: data, error: null };
}

export async function deleteReceiptUploadSession(sessionId: string) {
  const capability = await capabilityHash(sessionId);
  if (!capability) return { deleted: false, error: "收據確認工作階段無效。" };
  const { data, error } = await createSupabaseClient().rpc("delete_receipt_upload_session", {
    p_session_id: capability.sessionId,
    p_access_token_hash: capability.hash,
  });
  return error || !data ? { deleted: false, error: `取消工作階段失敗：${error?.message ?? "工作階段不可取消"}` } : { deleted: true, error: null };
}
