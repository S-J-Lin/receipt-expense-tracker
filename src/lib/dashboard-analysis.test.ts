import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { averageCents, calculateChange, categoryChanges, comparisonMode, comparisonPeriods, dashboardQueryRange, isDailyAnalysisExpense, projectMonthCents, summarizeDailyExpenses, summarizeExpenses } from "@/lib/dashboard-analysis";
import type { ExpenseWithDetails } from "@/types/expense";

function expense(overrides: Partial<ExpenseWithDetails> = {}): ExpenseWithDetails {
  return { id: crypto.randomUUID(), user_id: null, merchant: "A very long merchant name", expense_date: "2026-09-10", amount: 10, currency: "EUR", category: "餐飲", payment_method: null, receipt_image_url: null, receipt_image_path: null, raw_receipt_text: null, ai_confidence: null, notes: null, source: "manual", import_warnings: [], import_idempotency_key: null, created_at: "", updated_at: "", expense_items: [], expense_adjustments: [], ...overrides };
}

describe("Dashboard comparison analysis", () => {
  it("defaults to aligned comparison", () => expect(comparisonMode(undefined)).toBe("aligned"));
  it("builds aligned weekly ranges", () => expect(comparisonPeriods("2026-09", "aligned", "2026-09-10").week).toMatchObject({ current: { start: "2026-09-07", end: "2026-09-10" }, previous: { start: "2026-08-31", end: "2026-09-03" }, label: "與上週同期比較" }));
  it("builds full previous-week ranges", () => expect(comparisonPeriods("2026-09", "full", "2026-09-10").week.previous).toEqual({ start: "2026-08-31", end: "2026-09-06" }));
  it("builds aligned monthly ranges", () => expect(comparisonPeriods("2026-09", "aligned", "2026-09-13").month.previous).toEqual({ start: "2026-08-01", end: "2026-08-13" }));
  it("builds full previous-month ranges", () => expect(comparisonPeriods("2026-09", "full", "2026-09-13").month.previous).toEqual({ start: "2026-08-01", end: "2026-08-31" }));
  it("clamps aligned comparison to February", () => expect(comparisonPeriods("2026-03", "aligned", "2026-03-31").month.previous.end).toBe("2026-02-28"));
  it("clamps aligned comparison to leap-year February", () => expect(comparisonPeriods("2028-03", "aligned", "2028-03-31").month.previous.end).toBe("2028-02-29"));
  it("compares January across the year boundary", () => expect(comparisonPeriods("2026-01", "full", "2026-01-15").month.previous).toEqual({ start: "2025-12-01", end: "2025-12-31" }));
  it("requests one range covering all widgets", () => expect(dashboardQueryRange("2026-09", "aligned", "2026-09-10")).toEqual({ start: "2026-08-01", end: "2026-09-30" }));
  it("reports a new expense instead of Infinity", () => expect(calculateChange(100, 0)).toEqual({ kind: "new", differenceCents: 100, percent: null }));
  it("reports zero and flat when both periods are zero", () => expect(calculateChange(0, 0)).toEqual({ kind: "flat", differenceCents: 0, percent: 0 }));
  it("calculates daily average, projection, and transaction average in cents", () => { expect(averageCents(9700, 3)).toBe(3233); expect(projectMonthCents(9700, 3, 30)).toBe(96990); expect(averageCents(1236, 3)).toBe(412); });
  it("uses itemized allocations without double counting the expense category", () => {
    const data = summarizeExpenses([expense({ amount: 9, category: "其他", source: "chatgpt_import", expense_items: [{ id: "i", expense_id: "e", name_original: "Denkmit Geschirrspülmittel Ultra Sensitive", name_normalized: "洗碗精", brand: "Denkmit", quantity: 1, amount: 10, category: "日用品", confidence: 1, created_at: "", updated_at: "" }], expense_adjustments: [{ id: "a", expense_id: "e", name: "Coupon", amount: -1, category: "日用品", created_at: "", updated_at: "" }] })], { start: "2026-09-01", end: "2026-09-30" }).get("EUR")!;
    expect(data.totalCents).toBe(900); expect(data.categoryTotals.get("日用品")).toBe(900); expect(data.categoryTotals.has("其他")).toBe(false);
  });
  it("includes manual and recurring expenses and separates their sources", () => {
    const data = summarizeExpenses([expense({ source: "manual", amount: 4 }), expense({ source: "recurring", amount: 6 })], { start: "2026-09-01", end: "2026-09-30" }).get("EUR")!;
    expect(data).toMatchObject({ totalCents: 1000, count: 2, fixedCents: 600, variableCents: 400 });
  });
  it("includes rent and generated recurring expenses in actual total", () => { const data = summarizeExpenses([expense({ category: "房租", amount: 500 }), expense({ source: "recurring", category: "其他", amount: 20 })], { start: "2026-09-01", end: "2026-09-30" }).get("EUR")!; expect(data.totalCents).toBe(52000); expect(data.count).toBe(2); });
  it("does not add recurring rules or double-count a generated recurring expense", () => { const page = readFileSync("src/components/dashboard-page.tsx", "utf8"); expect(page).toContain("actualMonth = summarizeExpenses(monthExpenses"); expect(page).not.toContain("summarizeExpenses(recurringResult"); expect(summarizeExpenses([expense({ source: "recurring", amount: 20 })], { start: "2026-09-01", end: "2026-09-30" }).get("EUR")?.totalCents).toBe(2000); });
  it("uses category alone for the daily-analysis exclusion", () => { expect(isDailyAnalysisExpense(expense({ source: "manual", category: "房租" }))).toBe(false); expect(isDailyAnalysisExpense(expense({ source: "chatgpt_import", category: "房租" }))).toBe(false); expect(isDailyAnalysisExpense(expense({ source: "recurring", category: "房租" }))).toBe(false); expect(isDailyAnalysisExpense(expense({ source: "recurring", category: "其他" }))).toBe(true); });
  it("keeps recurring phone, insurance, and bank fees in daily analysis", () => { const data = summarizeDailyExpenses([expense({ source: "recurring", category: "其他", amount: 20 }), expense({ source: "recurring", category: "保險", amount: 130 }), expense({ source: "recurring", category: "其他", amount: 5 })], { start: "2026-09-01", end: "2026-09-30" }).get("EUR")!; expect(data.totalCents).toBe(15500); expect(data.count).toBe(3); });
  it("excludes rent from daily average, projection, and transaction-average numerator and denominator", () => { const data = summarizeDailyExpenses([expense({ category: "房租", amount: 500 }), expense({ category: "餐飲", amount: 100 }), expense({ category: "交通", amount: 20 })], { start: "2026-09-01", end: "2026-09-17" }).get("EUR")!; expect(data).toMatchObject({ totalCents: 12000, count: 2 }); expect(averageCents(data.totalCents, 17)).toBe(706); expect(projectMonthCents(data.totalCents, 17, 30)).toBe(21180); expect(averageCents(data.totalCents, data.count)).toBe(6000); });
  it.each([["aligned", "week"], ["full", "week"], ["aligned", "month"], ["full", "month"]] as const)("excludes rent from %s %s comparison on both sides", (mode, periodName) => { const periods = comparisonPeriods("2026-09", mode, "2026-09-17")[periodName]; const rows = [expense({ expense_date: periods.current.start, category: "房租", amount: 500 }), expense({ expense_date: periods.current.start, category: "餐飲", amount: 30 }), expense({ expense_date: periods.previous.start, category: "房租", amount: 450 }), expense({ expense_date: periods.previous.start, category: "餐飲", amount: 20 })]; expect(summarizeDailyExpenses(rows, periods.current).get("EUR")?.totalCents).toBe(3000); expect(summarizeDailyExpenses(rows, periods.previous).get("EUR")?.totalCents).toBe(2000); });
  it("keeps rent in donut/category totals and fixed-vs-variable totals", () => { const actual = summarizeExpenses([expense({ source: "recurring", category: "房租", amount: 500 }), expense({ category: "餐飲", amount: 100 })], { start: "2026-09-01", end: "2026-09-30" }).get("EUR")!; expect(actual.categoryTotals.get("房租")).toBe(50000); expect(actual).toMatchObject({ fixedCents: 50000, variableCents: 10000 }); });
  it("removes rent from category changes", () => { const current = summarizeExpenses([expense({ category: "房租", amount: 500 }), expense({ category: "餐飲", amount: 20 })], { start: "2026-09-01", end: "2026-09-30" }).get("EUR"); expect(categoryChanges(current, undefined).map((change) => change.category)).toEqual(["餐飲"]); });
  it("never mixes currencies", () => {
    const data = summarizeExpenses([expense(), expense({ currency: "TWD", amount: 20 })], { start: "2026-09-01", end: "2026-09-30" });
    expect(data.get("EUR")?.totalCents).toBe(1000); expect(data.get("TWD")?.totalCents).toBe(2000);
  });
  it("sorts category changes by absolute amount", () => {
    const current = summarizeExpenses([expense({ category: "餐飲", amount: 15 }), expense({ category: "交通", amount: 2 })], { start: "2026-09-01", end: "2026-09-30" }).get("EUR");
    const previous = summarizeExpenses([expense({ category: "餐飲", amount: 5 }), expense({ category: "交通", amount: 5 })], { start: "2026-09-01", end: "2026-09-30" }).get("EUR");
    expect(categoryChanges(current, previous).map((value) => value.category)).toEqual(["餐飲", "交通"]);
  });
  it("sets manual-entry date when the client form opens and prevents static date freezing", () => { const page = readFileSync("src/app/expenses/new/page.tsx", "utf8"); const form = readFileSync("src/components/manual-expense-form.tsx", "utf8"); expect(page).toContain('dynamic = "force-dynamic"'); expect(form).toContain("expense_date: localIsoDate()"); expect(form).not.toContain("{ today }"); });
  it("has responsive overflow, large-amount, toggle, donut, and empty/loading safeguards", () => {
    const css = readFileSync("src/app/globals.css", "utf8"); const view = readFileSync("src/components/dashboard-view.tsx", "utf8"); const toggle = readFileSync("src/components/dashboard-comparison-toggle.tsx", "utf8"); const loading = readFileSync("src/app/loading.tsx", "utf8");
    expect(css).toContain("overflow-x: clip"); expect(css).toContain("@media (max-width: 390px)"); expect(css).toContain(".dashboard-amount"); expect(view).toContain("line-clamp-2"); expect(toggle).toContain("aria-pressed"); expect(view).toContain("conic-gradient"); expect(view).toContain("尚無足夠資料可比較"); expect(view).toContain("不含房租"); expect(loading).toContain("Dashboard 載入中");
  });
});
