import "server-only";
import { requireAuthorizedUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Expense } from "@/types/expense";
import type { RecurringExpense } from "@/types/recurring-expense";

export async function getRecurringExpenses() {
  await requireAuthorizedUser();
  const { data, error } = await (await createServerSupabaseClient()).from("recurring_expenses").select("*").order("next_run_date");
  return { data: (data ?? []) as RecurringExpense[], error: error ? `無法讀取固定支出：${error.message}` : null };
}

export async function getRecurringExpense(id: string) {
  await requireAuthorizedUser();
  const { data, error } = await (await createServerSupabaseClient()).from("recurring_expenses").select("*").eq("id", id).maybeSingle();
  return { data: data as RecurringExpense | null, error: error ? `無法讀取固定支出：${error.message}` : null };
}

export async function getRecurringHistory(id: string) {
  await requireAuthorizedUser();
  const { data, error } = await (await createServerSupabaseClient()).from("expenses").select("*").eq("recurring_expense_id", id).order("expense_date", { ascending: false });
  return { data: (data ?? []) as Expense[], error: error ? `無法讀取產生紀錄：${error.message}` : null };
}
