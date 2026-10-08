import { describe, expect, it } from "vitest";
import { parseExpenseForm } from "@/lib/expense-validation";

const form = (amount: string) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ merchant: "SYNTHETIC", expense_date: "2026-10-08", amount, currency: "EUR", category: "其他", payment_method: "", notes: "" })) data.set(key, value);
  return data;
};
describe("receipt expense amounts", () => {
  it("accepts German comma and dot decimal without changing the amount", () => {
    for (const amount of ["12,50", "12.50"]) { const parsed = parseExpenseForm(form(amount)); expect(parsed.success).toBe(true); if (parsed.success) expect(parsed.data.amount).toBe(12.5); }
  });
  it("rejects rounding, thousands separators, negative and zero totals", () => {
    for (const amount of ["12,501", "12.501", "1,234.50", "1.234,50", "-1", "0"]) expect(parseExpenseForm(form(amount)).success).toBe(false);
  });
});
