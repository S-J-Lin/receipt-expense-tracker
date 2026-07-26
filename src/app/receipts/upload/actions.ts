"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getExpense } from "@/lib/expenses";
import { isValidReceiptPath } from "@/lib/receipt-validation";
import { removeReceipt, verifyUploadedReceipt } from "@/lib/receipt-storage";
import { createSupabaseClient } from "@/lib/supabase/client";

export type ReceiptMutationResult = { error: string | null; warning?: string };

export async function verifyReceiptUploadAction(path: string): Promise<ReceiptMutationResult> {
  try {
    return { error: await verifyUploadedReceipt(path) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "驗證收據時發生未知錯誤。" };
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
