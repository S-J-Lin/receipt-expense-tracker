"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseExpenseForm } from "@/lib/expense-validation";
import { confirmReceiptUploadSession, deleteReceiptUploadSession, getReceiptUploadSession } from "@/lib/receipt-sessions";
import { clearReceiptSessionCookie } from "@/lib/receipt-session-token";
import { removeReceipt } from "@/lib/receipt-storage";
import type { ExpenseActionState } from "@/app/actions";

export async function confirmReceiptSessionAction(sessionId: string, _state: ExpenseActionState, formData: FormData): Promise<ExpenseActionState> {
  const parsed = parseExpenseForm(formData);
  if (!parsed.success) return { message: "請修正表單中的錯誤。", errors: parsed.errors, values: parsed.values };
  const result = await confirmReceiptUploadSession(sessionId, parsed.data);
  if (result.error || !result.expenseId) return { message: result.error ?? "建立消費失敗。", values: parsed.values };
  await clearReceiptSessionCookie(sessionId);
  revalidatePath("/");
  revalidatePath("/expenses");
  redirect(`/expenses/${result.expenseId}?success=created`);
}

export async function cancelReceiptSessionAction(sessionId: string): Promise<void> {
  const session = await getReceiptUploadSession(sessionId);
  if (!session.data || session.error || session.data.status !== "pending") redirect(`/receipts/confirm/${sessionId}?error=cancel-failed`);
  const cleanupError = await removeReceipt(session.data.receipt_image_path);
  if (cleanupError) redirect(`/receipts/confirm/${sessionId}?error=cleanup-failed`);
  const result = await deleteReceiptUploadSession(sessionId);
  if (result.error) redirect(`/receipts/confirm/${sessionId}?error=cancel-failed`);
  await clearReceiptSessionCookie(sessionId);
  redirect("/?success=receipt-cancelled");
}
