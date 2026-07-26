import { describe, expect, it } from "vitest";
import { calculateDashboardStatistics } from "@/lib/dashboard-statistics";
import type { ExpenseWithDetails } from "@/types/expense";

function expense(overrides: Partial<ExpenseWithDetails> = {}): ExpenseWithDetails {
  return {
    id: "00000000-0000-4000-8000-000000000001", user_id: null, merchant: "Test", expense_date: "2026-07-26",
    amount: 10, currency: "EUR", category: "餐飲", payment_method: null, receipt_image_url: null,
    receipt_image_path: null, raw_receipt_text: null, ai_confidence: null, notes: null, source: "manual",
    import_warnings: [], import_idempotency_key: null, created_at: "2026-07-26T00:00:00Z", updated_at: "2026-07-26T00:00:00Z",
    expense_items: [], expense_adjustments: [], ...overrides,
  };
}

describe("calculateDashboardStatistics", () => {
  it("uses the expense category for manual and legacy expenses", () => {
    const result = calculateDashboardStatistics([expense()]);
    expect(result.totals.get("EUR")).toBe(1000);
    expect(result.categoryTotals.get("EUR")?.get("餐飲")).toBe(1000);
  });

  it("uses item and adjustment categories without double counting the expense total", () => {
    const result = calculateDashboardStatistics([expense({
      amount: 18.27, category: "其他", source: "chatgpt_import",
      expense_items: [
        { id: "1", expense_id: "e", name_original: "BANANEN", name_normalized: "香蕉", brand: "N/A", quantity: 1, amount: 2.49, category: "食品雜貨", confidence: 0.98, created_at: "", updated_at: "" },
        { id: "2", expense_id: "e", name_original: "BESEN", name_normalized: "掃把", brand: "N/A", quantity: 1, amount: 12.99, category: "日用品", confidence: 0.92, created_at: "", updated_at: "" },
      ],
      expense_adjustments: [{ id: "3", expense_id: "e", name: "Pfand", amount: 2.79, category: "其他", created_at: "", updated_at: "" }],
    })]);
    expect(result.totals.get("EUR")).toBe(1827);
    expect(result.categoryTotals.get("EUR")?.get("食品雜貨")).toBe(249);
    expect(result.categoryTotals.get("EUR")?.get("日用品")).toBe(1299);
    expect(result.categoryTotals.get("EUR")?.get("其他")).toBe(279);
  });

  it("keeps negative adjustments and the expense total independent", () => {
    const result = calculateDashboardStatistics([expense({ amount: 9, expense_items: [{ id: "1", expense_id: "e", name_original: "Item", name_normalized: null, brand: "N/A", quantity: 1, amount: 10, category: "食品雜貨", confidence: null, created_at: "", updated_at: "" }], expense_adjustments: [{ id: "2", expense_id: "e", name: "Coupon", amount: -1, category: "其他", created_at: "", updated_at: "" }] })]);
    expect(result.totals.get("EUR")).toBe(900);
    expect(result.categoryTotals.get("EUR")?.get("其他")).toBe(-100);
  });

  it("combines manual and ChatGPT totals while preserving each allocation model", () => {
    const result = calculateDashboardStatistics([
      expense({ id: "manual", amount: 5, category: "餐飲", source: "manual" }),
      expense({ id: "import", amount: 7, category: "其他", source: "chatgpt_import", expense_items: [{ id: "item", expense_id: "import", name_original: "Milk", name_normalized: "牛奶", brand: "N/A", quantity: 1, amount: 7, category: "食品雜貨", confidence: 1, created_at: "", updated_at: "" }] }),
    ]);
    expect(result.totals.get("EUR")).toBe(1200);
    expect(result.categoryTotals.get("EUR")?.get("餐飲")).toBe(500);
    expect(result.categoryTotals.get("EUR")?.get("食品雜貨")).toBe(700);
  });
});
