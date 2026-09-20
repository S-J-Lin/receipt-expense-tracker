import { addIsoDays, dashboardAnchorDate, daysInIsoMonth, inclusiveDayCount, monthEnd, monthStart, shiftIsoMonth, startOfIsoWeek } from "@/lib/local-date";
import { moneyToCents } from "@/lib/money";
import type { ExpenseWithDetails } from "@/types/expense";

export type ComparisonMode = "aligned" | "full";
export type DateRange = { start: string; end: string };
export type ComparisonPeriods = {
  week: { current: DateRange; previous: DateRange; label: string };
  month: { current: DateRange; previous: DateRange; label: string };
};
export type Change = { kind: "increase" | "decrease" | "flat" | "new"; differenceCents: number; percent: number | null };
export type CurrencyPeriodSummary = { totalCents: number; count: number; categoryTotals: Map<string, number>; fixedCents: number; variableCents: number };
export type CategoryChange = { category: string; currentCents: number; previousCents: number; differenceCents: number; percent: number | null };
export const DAILY_ANALYSIS_EXCLUDED_CATEGORY = "房租";

export function isDailyAnalysisExpense(expense: ExpenseWithDetails): boolean { return expense.category !== DAILY_ANALYSIS_EXCLUDED_CATEGORY; }

export function comparisonMode(value: string | undefined): ComparisonMode {
  return value === "full" ? "full" : "aligned";
}

export function comparisonPeriods(month: string, mode: ComparisonMode, today?: string): ComparisonPeriods {
  const anchor = dashboardAnchorDate(month, today);
  const weekStart = startOfIsoWeek(anchor);
  const elapsedWeekDays = inclusiveDayCount(weekStart, anchor);
  const previousWeekStart = addIsoDays(weekStart, -7);
  const previousMonth = shiftIsoMonth(month, -1);
  const previousAlignedDay = Math.min(Number(anchor.slice(8, 10)), daysInIsoMonth(previousMonth));
  return {
    week: {
      current: { start: weekStart, end: anchor },
      previous: { start: previousWeekStart, end: mode === "aligned" ? addIsoDays(previousWeekStart, elapsedWeekDays - 1) : addIsoDays(previousWeekStart, 6) },
      label: mode === "aligned" ? "與上週同期比較" : "本週截至今日 vs 上週完整週期",
    },
    month: {
      current: { start: monthStart(month), end: anchor },
      previous: { start: monthStart(previousMonth), end: mode === "aligned" ? `${previousMonth}-${String(previousAlignedDay).padStart(2, "0")}` : monthEnd(previousMonth) },
      label: mode === "aligned" ? "與上月同期比較" : "本月截至今日 vs 上月完整月份",
    },
  };
}

export function dashboardQueryRange(month: string, mode: ComparisonMode, today?: string): DateRange {
  const periods = comparisonPeriods(month, mode, today);
  return {
    start: [periods.week.previous.start, periods.month.previous.start].sort()[0],
    end: monthEnd(month),
  };
}

function addCategory(summary: CurrencyPeriodSummary, category: string, cents: number) {
  summary.categoryTotals.set(category, (summary.categoryTotals.get(category) ?? 0) + cents);
}

export function summarizeExpenses(expenses: ExpenseWithDetails[], range: DateRange): Map<string, CurrencyPeriodSummary> {
  const summaries = new Map<string, CurrencyPeriodSummary>();
  for (const expense of expenses) {
    if (expense.expense_date < range.start || expense.expense_date > range.end) continue;
    const summary = summaries.get(expense.currency) ?? { totalCents: 0, count: 0, categoryTotals: new Map(), fixedCents: 0, variableCents: 0 };
    const cents = moneyToCents(expense.amount);
    summary.totalCents += cents;
    summary.count += 1;
    if (expense.source === "recurring") summary.fixedCents += cents;
    else summary.variableCents += cents;
    const allocations = [...expense.expense_items, ...expense.expense_adjustments];
    if (allocations.length === 0) addCategory(summary, expense.category, cents);
    else for (const allocation of allocations) addCategory(summary, allocation.category, moneyToCents(allocation.amount));
    summaries.set(expense.currency, summary);
  }
  return summaries;
}

export function summarizeDailyExpenses(expenses: ExpenseWithDetails[], range: DateRange): Map<string, CurrencyPeriodSummary> { return summarizeExpenses(expenses.filter(isDailyAnalysisExpense), range); }

export function calculateChange(currentCents: number, previousCents: number): Change {
  const differenceCents = currentCents - previousCents;
  if (previousCents === 0) {
    if (currentCents === 0) return { kind: "flat", differenceCents, percent: 0 };
    return { kind: "new", differenceCents, percent: null };
  }
  const percent = (differenceCents / previousCents) * 100;
  return { kind: differenceCents > 0 ? "increase" : differenceCents < 0 ? "decrease" : "flat", differenceCents, percent };
}

export function averageCents(totalCents: number, divisor: number): number {
  return divisor > 0 ? Math.round(totalCents / divisor) : 0;
}

export function projectMonthCents(totalCents: number, daysElapsed: number, daysInMonth: number): number {
  return averageCents(totalCents, daysElapsed) * daysInMonth;
}

export function categoryChanges(current: CurrencyPeriodSummary | undefined, previous: CurrencyPeriodSummary | undefined): CategoryChange[] {
  const names = new Set([...(current?.categoryTotals.keys() ?? []), ...(previous?.categoryTotals.keys() ?? [])]);
  return [...names].filter((category) => category !== DAILY_ANALYSIS_EXCLUDED_CATEGORY).map((category) => {
    const currentCents = current?.categoryTotals.get(category) ?? 0;
    const previousCents = previous?.categoryTotals.get(category) ?? 0;
    const change = calculateChange(currentCents, previousCents);
    return { category, currentCents, previousCents, differenceCents: change.differenceCents, percent: change.percent };
  }).sort((a, b) => Math.abs(b.differenceCents) - Math.abs(a.differenceCents));
}
