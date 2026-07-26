import "server-only";

import { createSupabaseClient } from "@/lib/supabase/client";
import { EXPENSE_CATEGORIES, type Expense, type ExpenseAdjustment, type ExpenseItem, type ExpenseWithDetails } from "@/types/expense";

export type ExpenseFilters = { month?: string; category?: string; query?: string };
export type DataResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

export function isValidMonth(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

export function getCurrentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
  }).format(new Date()).slice(0, 7);
}

export function getMonthBounds(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: `${month}-01`,
    end: new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10),
  };
}

async function addDetails(expenses: Expense[]): Promise<DataResult<ExpenseWithDetails[]>> {
  if (expenses.length === 0) return { data: [], error: null };
  const supabase = createSupabaseClient();
  const ids = expenses.map((expense) => expense.id);
  const [itemsResult, adjustmentsResult] = await Promise.all([
    supabase.from("expense_items").select("*").in("expense_id", ids).order("created_at"),
    supabase.from("expense_adjustments").select("*").in("expense_id", ids).order("created_at"),
  ]);
  if (itemsResult.error) return { data: null, error: `無法讀取消費商品：${itemsResult.error.message}` };
  if (adjustmentsResult.error) return { data: null, error: `無法讀取消費調整項：${adjustmentsResult.error.message}` };
  const items = itemsResult.data as ExpenseItem[];
  const adjustments = adjustmentsResult.data as ExpenseAdjustment[];
  return {
    data: expenses.map((expense) => ({
      ...expense,
      expense_items: items.filter((item) => item.expense_id === expense.id),
      expense_adjustments: adjustments.filter((adjustment) => adjustment.expense_id === expense.id),
    })),
    error: null,
  };
}

export async function getExpenses(filters: ExpenseFilters = {}): Promise<DataResult<ExpenseWithDetails[]>> {
  try {
    const supabase = createSupabaseClient();
    let query = supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (isValidMonth(filters.month)) {
      const { start, end } = getMonthBounds(filters.month);
      query = query.gte("expense_date", start).lt("expense_date", end);
    }
    const category = filters.category as (typeof EXPENSE_CATEGORIES)[number] | undefined;
    if (category && EXPENSE_CATEGORIES.includes(category)) {
      query = query.eq("category", category);
    }
    if (filters.query?.trim()) query = query.ilike("merchant", `%${filters.query.trim()}%`);

    const { data, error } = await query;
    if (error) return { data: null, error: `無法讀取消費資料：${error.message}` };
    return addDetails(data);
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "讀取消費資料時發生未知錯誤。" };
  }
}

export async function getExpense(id: string): Promise<DataResult<ExpenseWithDetails>> {
  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase.from("expenses").select("*").eq("id", id).maybeSingle();
    if (error) return { data: null, error: `無法讀取消費資料：${error.message}` };
    if (!data) return { data: null, error: "找不到這筆消費紀錄。" };
    const detailed = await addDetails([data]);
    return detailed.data ? { data: detailed.data[0], error: null } : detailed;
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "讀取消費資料時發生未知錯誤。" };
  }
}
