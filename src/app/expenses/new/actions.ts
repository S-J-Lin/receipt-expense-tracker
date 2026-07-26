"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { manualExpenseSchema } from "@/lib/manual-expense-schema";
import { createSupabaseClient } from "@/lib/supabase/client";

export type ManualExpenseActionState = { error: string | null };

export async function createManualExpenseAction(payload: unknown, idempotencyKey: string): Promise<ManualExpenseActionState> {
  const key = z.string().uuid().safeParse(idempotencyKey);
  const parsed = manualExpenseSchema.safeParse(payload);
  if (!key.success) return { error: "儲存識別碼無效，請重新整理後再試。" };
  if (!parsed.success) return { error: `資料驗證失敗：${parsed.error.issues[0]?.message ?? "格式錯誤"}` };
  try {
    const { data, error } = await createSupabaseClient().rpc("create_manual_expense", {
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
    if (error || !data) return { error: `新增失敗：${error?.message ?? "資料庫未回傳 ID"}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "新增消費時發生未知錯誤。" };
  }
  revalidatePath("/");
  revalidatePath("/expenses");
  revalidatePath("/items");
  redirect("/?success=created");
}
