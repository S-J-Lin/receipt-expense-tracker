import "server-only";

import { createSupabaseClient } from "@/lib/supabase/client";
import { EXPENSE_CATEGORIES, type Expense } from "@/types/expense";

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

export async function getExpenses(filters: ExpenseFilters = {}): Promise<DataResult<Expense[]>> {
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
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "讀取消費資料時發生未知錯誤。" };
  }
}

export async function getExpense(id: string): Promise<DataResult<Expense>> {
  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase.from("expenses").select("*").eq("id", id).maybeSingle();
    if (error) return { data: null, error: `無法讀取消費資料：${error.message}` };
    if (!data) return { data: null, error: "找不到這筆消費紀錄。" };
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "讀取消費資料時發生未知錯誤。" };
  }
}
