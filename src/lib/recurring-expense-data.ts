import "server-only";
import { requireAuthorizedUser } from "@/lib/auth";
import { isUuid } from "@/lib/expenses";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { errorMessage, fetchAllPages, type PageResponse } from "@/lib/supabase/fetch-all";
import type { Expense } from "@/types/expense";
import type { RecurringExpense } from "@/types/recurring-expense";

/** All recurring rules, paged and count-verified. Throws on an incomplete read. */
export async function fetchAllRecurringExpenses(): Promise<RecurringExpense[]> {
  const supabase = await createServerSupabaseClient();
  return fetchAllPages<RecurringExpense>("固定支出規則", (from, to, withCount) =>
    supabase.from("recurring_expenses").select("*", withCount ? { count: "exact" } : undefined)
      .order("next_run_date").order("id").range(from, to) as unknown as PromiseLike<PageResponse<RecurringExpense>>, { getId: (row) => row.id });
}

export async function getRecurringExpenses() {
  await requireAuthorizedUser();
  try {
    return { data: await fetchAllRecurringExpenses(), error: null };
  } catch (error) {
    return { data: [] as RecurringExpense[], error: errorMessage(error, "無法讀取固定支出。") };
  }
}

export async function getRecurringExpense(id: string) {
  await requireAuthorizedUser();
  if (!isUuid(id)) return { data: null, error: null };
  const { data, error } = await (await createServerSupabaseClient()).from("recurring_expenses").select("*").eq("id", id).maybeSingle();
  return { data: data as RecurringExpense | null, error: error ? `無法讀取固定支出：${error.message}` : null };
}

export async function getRecurringHistory(id: string) {
  await requireAuthorizedUser();
  if (!isUuid(id)) return { data: [] as Expense[], error: null };
  try {
    const supabase = await createServerSupabaseClient();
    const data = await fetchAllPages<Expense>("固定支出產生紀錄", (from, to, withCount) =>
      supabase.from("expenses").select("*", withCount ? { count: "exact" } : undefined).eq("recurring_expense_id", id)
        .order("expense_date", { ascending: false }).order("id").range(from, to) as unknown as PromiseLike<PageResponse<Expense>>, { getId: (row) => row.id });
    return { data, error: null };
  } catch (error) {
    return { data: [] as Expense[], error: errorMessage(error, "無法讀取產生紀錄。") };
  }
}
