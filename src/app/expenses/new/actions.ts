"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuthorizedUser } from "@/lib/auth";
import { logDbError, toUserMessage } from "@/lib/errors";
import { getExpense } from "@/lib/expenses";
import { fingerprintFromPayload, fingerprintFromStored, IDEMPOTENCY_CONFLICT_MESSAGE, sameFingerprint } from "@/lib/idempotency";
import { manualExpenseSchema } from "@/lib/manual-expense-schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ManualExpenseActionState = { error: string | null; conflictId?: string };

export async function createManualExpenseAction(payload: unknown, idempotencyKey: string): Promise<ManualExpenseActionState> {
  await requireAuthorizedUser();
  const key = z.string().uuid().safeParse(idempotencyKey);
  const parsed = manualExpenseSchema.safeParse(payload);
  if (!key.success) return { error: "儲存識別碼無效，請重新整理後再試。" };
  if (!parsed.success) return { error: `資料驗證失敗：${parsed.error.issues[0]?.message ?? "格式錯誤"}` };
  let expenseId: string;
  try {
    const { data, error } = await (await createServerSupabaseClient()).rpc("create_manual_expense", {
      p_idempotency_key: key.data,
      p_merchant: parsed.data.merchant,
      p_expense_date: parsed.data.expense_date,
      p_currency: parsed.data.currency,
      p_total_amount: parsed.data.total_amount,
      p_category: parsed.data.category,
      p_payment_method: parsed.data.payment_method || null,
      p_notes: parsed.data.notes || null,
      p_items: parsed.data.items,
      p_adjustments: parsed.data.adjustments,
    });
    if (error || !data) { logDbError("create manual expense", error); return { error: `新增失敗：${toUserMessage(error, "資料庫未回傳 ID")}` }; }
    expenseId = data;
  } catch {
    return { error: "新增消費時無法連線，請確認網路後重試（重試不會重複新增）。" };
  }
  const stored = await getExpense(expenseId);
  if (stored.data && !sameFingerprint(fingerprintFromStored(stored.data), fingerprintFromPayload(parsed.data))) {
    return { error: IDEMPOTENCY_CONFLICT_MESSAGE, conflictId: expenseId };
  }
  revalidatePath("/");
  revalidatePath("/expenses");
  revalidatePath("/items");
  redirect("/?success=created");
}
