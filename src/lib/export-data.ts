import "server-only";
import { requireAuthorizedUser } from "@/lib/auth";

import { filterExportDataset, type ExportDataset, type ExportFilters } from "@/lib/export";
import { getExpenses } from "@/lib/expenses";
import { fetchAllProductAliases } from "@/lib/items";
import { fetchAllRecurringExpenses } from "@/lib/recurring-expense-data";
import { errorMessage } from "@/lib/supabase/fetch-all";

/**
 * Loads the export dataset. Date bounds are applied in the database; the other
 * filters need item fields and run in memory. Every read is paged and
 * count-verified: an incomplete read returns an error and no file is produced.
 */
export async function getExportDataset(filters: ExportFilters): Promise<{ data: ExportDataset | null; error: string | null }> {
  await requireAuthorizedUser();
  try {
    const [expenses, aliases, recurringExpenses] = await Promise.all([
      getExpenses({ start: filters.start, end: filters.end }),
      fetchAllProductAliases(),
      fetchAllRecurringExpenses(),
    ]);
    if (!expenses.data) return { data: null, error: expenses.error };
    return { data: filterExportDataset({ expenses: expenses.data, aliases, recurringExpenses }, filters), error: null };
  } catch (error) {
    return { data: null, error: errorMessage(error, "無法讀取匯出資料。") };
  }
}
