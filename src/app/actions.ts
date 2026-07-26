"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { expenseFormSchema, formDataToExpenseValues } from "@/lib/expense-validation";
import { createSupabaseClient } from "@/lib/supabase/client";
import type { ExpenseInsert } from "@/types/expense";

type RawValues = ReturnType<typeof formDataToExpenseValues>;
export type ExpenseActionState = {
  message: string;
  errors?: Partial<Record<keyof RawValues, string[]>>;
  values?: RawValues;
};

function parseExpense(formData: FormData): { success: true; data: ExpenseInsert; values: RawValues } | { success: false; state: ExpenseActionState } {
  const values = formDataToExpenseValues(formData);
  const result = expenseFormSchema.safeParse(values);
  if (!result.success) {
    return { success: false, state: { message: "請修正表單中的錯誤。", errors: result.error.flatten().fieldErrors, values } };
  }
  return {
    success: true,
    values,
    data: {
      merchant: result.data.merchant,
      expense_date: result.data.expense_date,
      amount: Number(result.data.amount.replace(",", ".")),
      currency: result.data.currency,
      category: result.data.category,
      payment_method: result.data.payment_method || null,
      notes: result.data.notes || null,
    },
  };
}

function actionError(error: unknown, values: RawValues): ExpenseActionState {
  return { message: error instanceof Error ? error.message : "儲存消費時發生未知錯誤。", values };
}

export async function createExpenseAction(_state: ExpenseActionState, formData: FormData): Promise<ExpenseActionState> {
  const parsed = parseExpense(formData);
  if (!parsed.success) return parsed.state;
  try {
    const { error } = await createSupabaseClient().from("expenses").insert(parsed.data);
    if (error) return { message: `新增失敗：${error.message}`, values: parsed.values };
  } catch (error) { return actionError(error, parsed.values); }
  revalidatePath("/");
  revalidatePath("/expenses");
  redirect("/?success=created");
}

export async function updateExpenseAction(id: string, _state: ExpenseActionState, formData: FormData): Promise<ExpenseActionState> {
  const validId = z.string().uuid().safeParse(id);
  if (!validId.success) return { message: "消費紀錄 ID 無效。" };
  const parsed = parseExpense(formData);
  if (!parsed.success) return parsed.state;
  try {
    const { error } = await createSupabaseClient().from("expenses").update(parsed.data).eq("id", validId.data);
    if (error) return { message: `更新失敗：${error.message}`, values: parsed.values };
  } catch (error) { return actionError(error, parsed.values); }
  revalidatePath("/");
  revalidatePath("/expenses");
  revalidatePath(`/expenses/${validId.data}`);
  redirect(`/expenses/${validId.data}?success=updated`);
}

export async function deleteExpenseAction(id: string, _formData: FormData): Promise<void> {
  void _formData;
  const validId = z.string().uuid().safeParse(id);
  if (!validId.success) redirect("/expenses?error=invalid-id");
  try {
    const { error } = await createSupabaseClient().from("expenses").delete().eq("id", validId.data);
    if (error) redirect(`/expenses/${validId.data}?error=delete-failed`);
  } catch { redirect(`/expenses/${validId.data}?error=delete-failed`); }
  revalidatePath("/");
  revalidatePath("/expenses");
  redirect("/expenses?success=deleted");
}
