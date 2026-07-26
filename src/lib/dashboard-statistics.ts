import { moneyToCents } from "@/lib/money";
import type { ExpenseWithDetails } from "@/types/expense";

export type DashboardStatistics = {
  totals: Map<string, number>;
  categoryTotals: Map<string, Map<string, number>>;
  dailyTotals: Map<string, Map<string, number>>;
};

export function calculateDashboardStatistics(expenses: ExpenseWithDetails[]): DashboardStatistics {
  const totals = new Map<string, number>();
  const categoryTotals = new Map<string, Map<string, number>>();
  const dailyTotals = new Map<string, Map<string, number>>();

  for (const expense of expenses) {
    const cents = moneyToCents(expense.amount);
    totals.set(expense.currency, (totals.get(expense.currency) ?? 0) + cents);
    const days = dailyTotals.get(expense.currency) ?? new Map<string, number>();
    days.set(expense.expense_date, (days.get(expense.expense_date) ?? 0) + cents);
    dailyTotals.set(expense.currency, days);

    const categories = categoryTotals.get(expense.currency) ?? new Map<string, number>();
    const allocations = [...expense.expense_items, ...expense.expense_adjustments];
    if (allocations.length > 0) {
      for (const allocation of allocations) {
        const allocationCents = moneyToCents(allocation.amount);
        categories.set(allocation.category, (categories.get(allocation.category) ?? 0) + allocationCents);
      }
    } else {
      categories.set(expense.category, (categories.get(expense.category) ?? 0) + cents);
    }
    categoryTotals.set(expense.currency, categories);
  }
  return { totals, categoryTotals, dailyTotals };
}
