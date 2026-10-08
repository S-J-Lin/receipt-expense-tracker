import "server-only";
import { requireAuthorizedUser } from "@/lib/auth";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logDbError, toUserMessage } from "@/lib/errors";
import { errorMessage, fetchAllByIdChunks, fetchAllPages, type PageResponse } from "@/lib/supabase/fetch-all";
import { localMonth, monthEnd, monthStart } from "@/lib/local-date";
import { EXPENSE_CATEGORIES, type Expense, type ExpenseAdjustment, type ExpenseCategory, type ExpenseItem, type ExpenseWithDetails } from "@/types/expense";

export type ExpenseFilters = { month?: string; start?: string; end?: string; category?: string; query?: string };
export type DataResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EXPENSE_PAGE_SIZE = 50;

export function isValidMonth(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

export function isUuid(value: string | undefined | null): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

export function getCurrentMonth(): string {
  return localMonth();
}

/** Inclusive Europe/Berlin calendar bounds of a YYYY-MM month. */
export function getMonthBounds(month: string): { start: string; end: string } {
  return { start: monthStart(month), end: monthEnd(month) };
}

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

// Minimal structural type of the PostgREST filter builder used below.
type FilterBuilder<Q> = { gte(column: string, value: string): Q; lte(column: string, value: string): Q; eq(column: string, value: string): Q; ilike(column: string, value: string): Q };

function applyFilters<Q extends FilterBuilder<Q>>(builder: Q, filters: ExpenseFilters): Q {
  let next = builder;
  if (isValidMonth(filters.month)) {
    const { start, end } = getMonthBounds(filters.month);
    next = next.gte("expense_date", start).lte("expense_date", end);
  } else {
    if (filters.start) next = next.gte("expense_date", filters.start);
    if (filters.end) next = next.lte("expense_date", filters.end);
  }
  const category = filters.category as ExpenseCategory | undefined;
  if (category && EXPENSE_CATEGORIES.includes(category)) next = next.eq("category", category);
  // `%` and `_` are LIKE wildcards; escape them so the search is literal.
  const search = filters.query?.trim().replace(/[\\%_]/g, (match) => `\\${match}`);
  if (search) next = next.ilike("merchant", `%${search}%`);
  return next;
}

async function loadDetails(supabase: Supabase, expenses: Expense[]): Promise<ExpenseWithDetails[]> {
  if (expenses.length === 0) return [];
  const ids = expenses.map((expense) => expense.id);
  const items = await fetchAllByIdChunks(ids, (part) => fetchAllPages<ExpenseItem>("消費商品", (from, to, withCount) =>
    supabase.from("expense_items").select("*", withCount ? { count: "exact" } : undefined).in("expense_id", part)
      .order("created_at").order("id").range(from, to) as unknown as PromiseLike<PageResponse<ExpenseItem>>, { getId: (row) => row.id }));
  const adjustments = await fetchAllByIdChunks(ids, (part) => fetchAllPages<ExpenseAdjustment>("消費調整項", (from, to, withCount) =>
    supabase.from("expense_adjustments").select("*", withCount ? { count: "exact" } : undefined).in("expense_id", part)
      .order("created_at").order("id").range(from, to) as unknown as PromiseLike<PageResponse<ExpenseAdjustment>>, { getId: (row) => row.id }));
  const itemsByExpense = new Map<string, ExpenseItem[]>();
  for (const item of items) { const list = itemsByExpense.get(item.expense_id); if (list) list.push(item); else itemsByExpense.set(item.expense_id, [item]); }
  const adjustmentsByExpense = new Map<string, ExpenseAdjustment[]>();
  for (const adjustment of adjustments) { const list = adjustmentsByExpense.get(adjustment.expense_id); if (list) list.push(adjustment); else adjustmentsByExpense.set(adjustment.expense_id, [adjustment]); }
  return expenses.map((expense) => ({
    ...expense,
    expense_items: itemsByExpense.get(expense.id) ?? [],
    expense_adjustments: adjustmentsByExpense.get(expense.id) ?? [],
  }));
}

/**
 * Returns every matching expense with its items and adjustments. Reads are
 * paged and count-verified; an incomplete read returns an error instead of a
 * silently truncated ledger.
 */
export async function getExpenses(filters: ExpenseFilters = {}): Promise<DataResult<ExpenseWithDetails[]>> {
  await requireAuthorizedUser();
  try {
    const supabase = await createServerSupabaseClient();
    const expenses = await fetchAllPages<Expense>("消費資料", (from, to, withCount) =>
      applyFilters(supabase.from("expenses").select("*", withCount ? { count: "exact" } : undefined), filters)
        .order("expense_date", { ascending: false }).order("created_at", { ascending: false }).order("id")
        .range(from, to) as unknown as PromiseLike<PageResponse<Expense>>, { getId: (row) => row.id });
    return { data: await loadDetails(supabase, expenses), error: null };
  } catch (error) {
    return { data: null, error: errorMessage(error, "讀取消費資料時發生未知錯誤。") };
  }
}

/** One page of expense headers for list views; items are not loaded. */
export async function listExpenses(filters: ExpenseFilters, page: number): Promise<DataResult<{ expenses: Expense[]; total: number; page: number; pageCount: number }>> {
  await requireAuthorizedUser();
  try {
    const supabase = await createServerSupabaseClient();
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const from = (safePage - 1) * EXPENSE_PAGE_SIZE;
    const { data, error, count } = await applyFilters(supabase.from("expenses").select("*", { count: "exact" }), filters)
      .order("expense_date", { ascending: false }).order("created_at", { ascending: false }).order("id")
      .range(from, from + EXPENSE_PAGE_SIZE - 1);
    if (error) { logDbError("read expenses", error); return { data: null, error: `無法讀取消費資料：${toUserMessage(error)}` }; }
    const total = count ?? 0;
    return { data: { expenses: (data ?? []) as Expense[], total, page: safePage, pageCount: Math.max(1, Math.ceil(total / EXPENSE_PAGE_SIZE)) }, error: null };
  } catch (error) {
    return { data: null, error: errorMessage(error, "讀取消費資料時發生未知錯誤。") };
  }
}

export async function getExpense(id: string): Promise<DataResult<ExpenseWithDetails>> {
  await requireAuthorizedUser();
  if (!isUuid(id)) return { data: null, error: "找不到這筆消費紀錄。" };
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.from("expenses").select("*").eq("id", id).maybeSingle();
    if (error) { logDbError("read expenses", error); return { data: null, error: `無法讀取消費資料：${toUserMessage(error)}` }; }
    if (!data) return { data: null, error: "找不到這筆消費紀錄。" };
    const [detailed] = await loadDetails(supabase, [data as Expense]);
    return { data: detailed, error: null };
  } catch (error) {
    return { data: null, error: errorMessage(error, "讀取消費資料時發生未知錯誤。") };
  }
}
