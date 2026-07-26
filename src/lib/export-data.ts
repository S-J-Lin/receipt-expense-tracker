import "server-only";

import { filterExportDataset, type ExportDataset, type ExportFilters } from "@/lib/export";
import { getExpenses } from "@/lib/expenses";
import { createSupabaseClient } from "@/lib/supabase/client";
import type { ProductAlias } from "@/types/expense";

export async function getExportDataset(filters: ExportFilters): Promise<{ data: ExportDataset | null; error: string | null }> {
  const [expenses, aliases] = await Promise.all([
    getExpenses(),
    createSupabaseClient().from("product_aliases").select("*").order("alias_normalized"),
  ]);
  if (!expenses.data) return { data: null, error: expenses.error };
  if (aliases.error) return { data: null, error: `無法讀取商品別名：${aliases.error.message}` };
  return { data: filterExportDataset({ expenses: expenses.data, aliases: aliases.data as ProductAlias[] }, filters), error: null };
}
