import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { berlinDate, nextMonthlyRun, recurringExpenseSchema, scheduledDate } from "@/lib/recurring-expenses";

describe("monthly recurring expenses", () => {
  it("supports the first day", () => expect(nextMonthlyRun(1, "2026-01-01", "2026-07-01")).toBe("2026-07-01"));
  it("clamps day 31 to February", () => expect(scheduledDate(2026, 2, 31)).toBe("2026-02-28"));
  it("handles leap-year February", () => expect(scheduledDate(2028, 2, 31)).toBe("2028-02-29"));
  it("uses the Europe/Berlin calendar boundary", () => expect(berlinDate(new Date("2026-07-26T22:30:00Z"))).toBe("2026-07-27"));
  it("moves past an elapsed date", () => expect(nextMonthlyRun(5, "2026-01-01", "2026-07-06")).toBe("2026-08-05"));
  it("validates amount, day, currency and end date", () => {
    const result = recurringExpenseSchema.safeParse({ merchant: "Rent", amount: 0, currency: "EU", category: "房租", day_of_month: 32, start_date: "2026-07-01", end_date: "2026-06-01", is_active: true });
    expect(result.success).toBe(false);
  });
  it("contracts idempotency, catch-up limit, RLS and retained history in SQL", () => {
    const sql = readFileSync("supabase/migrations/20260727000100_add_recurring_expenses.sql", "utf8");
    expect(sql).toContain("on public.expenses (recurring_expense_id, recurring_period)");
    expect(sql).toContain("least(greatest(p_max_periods, 1), 12)");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("on delete set null");
    expect(sql).toContain("Europe/Berlin");
  });
  it("protects the daily cron route", () => {
    const route = readFileSync("src/app/api/cron/recurring-expenses/route.ts", "utf8");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("Bearer");
  });
  it("shows recurring deductions between categories and daily trends without a create action", () => {
    const dashboard = readFileSync("src/app/page.tsx", "utf8");
    const categoryPosition = dashboard.indexOf("各類別支出");
    const recurringPosition = dashboard.indexOf("{recurringSection}", categoryPosition);
    expect(categoryPosition).toBeLessThan(recurringPosition);
    expect(recurringPosition).toBeLessThan(dashboard.indexOf("每日趨勢"));
    expect(dashboard).not.toContain('href="/recurring/new"');
  });
  it("persists due recurring charges as monthly expenses", () => {
    const sql = readFileSync("supabase/migrations/20260727000100_add_recurring_expenses.sql", "utf8");
    expect(sql).toContain("insert into public.expenses");
    expect(sql).toContain("'recurring', v_rule.id, v_period");
  });
});
