import "server-only";
import { filterItemPurchases, type ItemPurchase, type ItemSearchFilters } from "@/lib/item-analytics";
import { createSupabaseClient } from "@/lib/supabase/client";
import type { Expense, ExpenseItem, ProductAlias } from "@/types/expense";

export async function getProductAliases(): Promise<{ data: ProductAlias[]; error: string | null }> {
  try {
    const { data, error } = await createSupabaseClient().from("product_aliases").select("*").order("alias_normalized");
    return error ? { data: [], error: error.message } : { data: data as ProductAlias[], error: null };
  } catch (error) { return { data: [], error: error instanceof Error ? error.message : "無法讀取商品別名。" }; }
}

export async function searchItems(filters: ItemSearchFilters): Promise<{ data: ItemPurchase[]; error: string | null }> {
  try {
    const supabase = createSupabaseClient();
    const [itemsResult, expensesResult, aliasesResult] = await Promise.all([
      supabase.from("expense_items").select("*"),
      supabase.from("expenses").select("*"),
      supabase.from("product_aliases").select("*"),
    ]);
    if (itemsResult.error || expensesResult.error || aliasesResult.error) return { data: [], error: itemsResult.error?.message ?? expensesResult.error?.message ?? aliasesResult.error?.message ?? "讀取失敗" };
    const expenses = new Map((expensesResult.data as Expense[]).map((expense) => [expense.id, expense]));
    const query = filters.query?.trim().toLocaleLowerCase();
    const aliasNames = query ? (aliasesResult.data as ProductAlias[]).filter((alias) => alias.alias_normalized.includes(query) || alias.normalized_name.toLocaleLowerCase().includes(query)).map((alias) => alias.normalized_name) : [];
    const purchases = (itemsResult.data as ExpenseItem[]).flatMap((item) => { const expense = expenses.get(item.expense_id); return expense ? [{ ...item, merchant: expense.merchant, expense_date: expense.expense_date, currency: expense.currency }] : []; });
    return { data: filterItemPurchases(purchases, { ...filters, aliasNormalizedNames: aliasNames }), error: null };
  } catch (error) { return { data: [], error: error instanceof Error ? error.message : "商品搜尋失敗。" }; }
}
