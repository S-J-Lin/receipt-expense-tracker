import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardView } from "@/components/dashboard-view";
import { comparisonPeriods, summarizeDailyExpenses, summarizeExpenses } from "@/lib/dashboard-analysis";
import type { ExpenseWithDetails } from "@/types/expense";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

// Synthetic fixtures only.
let sequence = 0;
function expense(overrides: Partial<ExpenseWithDetails> = {}): ExpenseWithDetails {
  sequence += 1;
  return { id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`, user_id: "u", merchant: "Café", expense_date: "2026-09-10", amount: 10, currency: "EUR", category: "餐飲", payment_method: null, receipt_image_url: null, receipt_image_path: null, raw_receipt_text: null, ai_confidence: null, notes: null, source: "manual", import_warnings: [], import_idempotency_key: null, created_at: "", updated_at: "", expense_items: [], expense_adjustments: [], ...overrides };
}

function render(expenses: ExpenseWithDetails[], today = "2026-09-17") {
  const periods = comparisonPeriods("2026-09", "aligned", today);
  const month = { start: "2026-09-01", end: "2026-09-30" };
  return renderToStaticMarkup(<DashboardView actualMonth={summarizeExpenses(expenses, month)} currentMonth={summarizeDailyExpenses(expenses, periods.month.current)} currentWeek={summarizeDailyExpenses(expenses, periods.week.current)} isCurrentMonth mode="aligned" month="2026-09" monthExpenses={expenses} periods={periods} previousMonth={summarizeDailyExpenses(expenses, periods.month.previous)} previousWeek={summarizeDailyExpenses(expenses, periods.week.previous)} recurring={[]} recurringError={null} />);
}

describe("Dashboard view", () => {
  it("shows recent expenses first and at most five of them", () => {
    const html = render(Array.from({ length: 8 }, (_, index) => expense({ merchant: `Shop ${index}` })));
    expect(html.indexOf("最近消費")).toBeLessThan(html.indexOf("日常消費分析"));
    expect((html.match(/Shop \d/g) ?? []).length).toBe(5);
  });
  it("includes rent in the distribution but excludes it from daily analysis", () => {
    const html = render([expense({ category: "房租", amount: 700, source: "recurring" }), expense({ amount: 20, expense_date: "2026-09-15" })]);
    expect(html).toContain("房租");
    expect(html).toContain("720,00");        // distribution total includes rent
    expect(html).toMatch(/日常交易[\s\S]*?1 筆/); // only the non-rent expense
  });
  it("shows an unallocated difference row without changing the total", () => {
    const html = render([expense({ amount: 10, expense_items: [{ id: "i", expense_id: "e", name_original: "x", name_normalized: "x", quantity: 1, amount: 7, category: "食品雜貨", confidence: null, brand: "N/A", created_at: "", updated_at: "" }] })]);
    expect(html).toContain("未分配差額");
    expect(html).toContain("3,00");
    expect(html).toContain("10,00");
  });
  it("keeps currencies in separate sections", () => {
    const html = render([expense({ currency: "EUR", amount: 5 }), expense({ currency: "TWD", amount: 300 })]);
    expect(html).toContain("本月支出分布 · EUR");
    expect(html).toContain("本月支出分布 · TWD");
    expect(html).not.toContain("305");
  });
  it("uses a 2×2 metric grid on phones and exposes the comparison mode state", () => {
    const html = render([expense()]);
    expect(html).toContain("grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4");
    expect(html).toContain('aria-pressed="true"');
  });
});
