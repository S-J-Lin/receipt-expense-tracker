"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getExpense } from "@/lib/expenses";
import { createReceiptUploadSession, replaceReceiptUploadSessionFile, type ReceiptUploadMetadata } from "@/lib/receipt-sessions";
import { isValidReceiptPath } from "@/lib/receipt-validation";
import { removeReceipt, verifyUploadedReceipt } from "@/lib/receipt-storage";
import { createSupabaseClient } from "@/lib/supabase/client";

export type ReceiptMutationResult = { error: string | null; warning?: string; sessionId?: string };

export async function createReceiptUploadSessionAction(path: string, metadata: ReceiptUploadMetadata): Promise<ReceiptMutationResult> {
  try {
    const verificationError = await verifyUploadedReceipt(path);
    if (verificationError) return { error: verificationError };
    const result = await createReceiptUploadSession(path, metadata);
    if (result.error) await removeReceipt(path);
    return { error: result.error, sessionId: result.sessionId ?? undefined };
  } catch (error) {
    await removeReceipt(path);
    return { error: error instanceof Error ? error.message : "建立收據確認工作階段時發生未知錯誤。" };
  }
}

export async function replaceReceiptSessionFileAction(sessionId: string, path: string, metadata: ReceiptUploadMetadata): Promise<ReceiptMutationResult> {
  try {
    const verificationError = await verifyUploadedReceipt(path);
    if (verificationError) return { error: verificationError };
    const result = await replaceReceiptUploadSessionFile(sessionId, path, metadata);
    if (result.error) {
      await removeReceipt(path);
      return { error: result.error };
    }
    const cleanupError = result.oldPath !== path ? await removeReceipt(result.oldPath) : null;
    revalidatePath(`/receipts/confirm/${sessionId}`);
    return { error: null, warning: cleanupError ? "receipt-cleanup-failed" : undefined, sessionId };
  } catch (error) {
    await removeReceipt(path);
    return { error: error instanceof Error ? error.message : "替換暫存收據時發生未知錯誤。" };
  }
}

export async function replaceExpenseReceiptAction(id: string, path: string): Promise<ReceiptMutationResult> {
  const validId = z.string().uuid().safeParse(id);
  if (!validId.success || !isValidReceiptPath(path)) return { error: "消費紀錄或收據路徑無效。" };
  const verificationError = await verifyUploadedReceipt(path);
  if (verificationError) return { error: verificationError };
  const existing = await getExpense(validId.data);
  if (!existing.data) {
    await removeReceipt(path);
    return { error: existing.error };
  }
  const { error } = await createSupabaseClient().from("expenses").update({ receipt_image_path: path }).eq("id", validId.data);
  if (error) {
    await removeReceipt(path);
    return { error: `更新收據失敗：${error.message}` };
  }
  const cleanupError = existing.data.receipt_image_path && existing.data.receipt_image_path !== path
    ? await removeReceipt(existing.data.receipt_image_path)
    : null;
  revalidatePath("/");
  revalidatePath("/expenses");
  revalidatePath(`/expenses/${validId.data}`);
  return { error: null, warning: cleanupError ? "receipt-cleanup-failed" : undefined };
}
