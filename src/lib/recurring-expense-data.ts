import "server-only";
import { createSupabaseClient } from "@/lib/supabase/client";
import type { Expense } from "@/types/expense";
import type { RecurringExpense } from "@/types/recurring-expense";

export async function getRecurringExpenses() {
  const { data, error } = await createSupabaseClient().from("recurring_expenses").select("*").order("next_run_date");
  return { data: (data ?? []) as RecurringExpense[], error: error ? `無法讀取固定支出：${error.message}` : null };
}

export async function getRecurringExpense(id: string) {
  const { data, error } = await createSupabaseClient().from("recurring_expenses").select("*").eq("id", id).maybeSingle();
  return { data: data as RecurringExpense | null, error: error ? `無法讀取固定支出：${error.message}` : null };
}

export async function getRecurringHistory(id: string) {
  const { data, error } = await createSupabaseClient().from("expenses").select("*").eq("recurring_expense_id", id).order("expense_date", { ascending: false });
  return { data: (data ?? []) as Expense[], error: error ? `無法讀取產生紀錄：${error.message}` : null };
}

