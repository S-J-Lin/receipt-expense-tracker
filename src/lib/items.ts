import "server-only";
import { requireAuthorizedUser } from "@/lib/auth";
import { getExpenses } from "@/lib/expenses";
import { filterItemPurchases, type ItemPurchase, type ItemSearchFilters } from "@/lib/item-analytics";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { errorMessage, fetchAllPages, type PageResponse } from "@/lib/supabase/fetch-all";
import type { ProductAlias } from "@/types/expense";

/** All product aliases, paged and count-verified. Throws on an incomplete read. */
export async function fetchAllProductAliases(): Promise<ProductAlias[]> {
  const supabase = await createServerSupabaseClient();
  return fetchAllPages<ProductAlias>("商品別名", (from, to, withCount) =>
    supabase.from("product_aliases").select("*", withCount ? { count: "exact" } : undefined)
      .order("alias_normalized").order("id").range(from, to) as unknown as PromiseLike<PageResponse<ProductAlias>>, { getId: (row) => row.id });
}

export async function getProductAliases(): Promise<{ data: ProductAlias[]; error: string | null }> {
  await requireAuthorizedUser();
  try {
    return { data: await fetchAllProductAliases(), error: null };
  } catch (error) { return { data: [], error: errorMessage(error, "無法讀取商品別名。") }; }
}

export async function searchItems(filters: ItemSearchFilters): Promise<{ data: ItemPurchase[]; error: string | null }> {
  await requireAuthorizedUser();
  try {
    // Date filtering happens in the database; the remaining filters need item fields.
    const [expenses, aliases] = await Promise.all([
      getExpenses({ start: filters.start, end: filters.end }),
      fetchAllProductAliases(),
    ]);
    if (!expenses.data) return { data: [], error: expenses.error };
    const query = filters.query?.trim().toLocaleLowerCase();
    const aliasNames = query ? aliases.filter((alias) => alias.alias_normalized.includes(query) || alias.normalized_name.toLocaleLowerCase().includes(query)).map((alias) => alias.normalized_name) : [];
    const purchases: ItemPurchase[] = expenses.data.flatMap((expense) => expense.expense_items.map((item) => ({ ...item, merchant: expense.merchant, expense_date: expense.expense_date, currency: expense.currency })));
    return { data: filterItemPurchases(purchases, { ...filters, aliasNormalizedNames: aliasNames }), error: null };
  } catch (error) { return { data: [], error: errorMessage(error, "商品搜尋失敗。") }; }
}
