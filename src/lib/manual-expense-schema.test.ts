import { describe, expect, it } from "vitest";
import { itemizedDifferenceCents, manualExpenseSchema } from "@/lib/manual-expense-schema";

const base = { merchant: "Cafe", expense_date: "2026-07-26", total_amount: 4.5, currency: "eur", category: "餐飲" as const };

describe("manualExpenseSchema", () => {
  it("allows a manual expense without items and never creates a placeholder row", () => expect(manualExpenseSchema.parse(base)).toMatchObject({ currency: "EUR", items: [], adjustments: [] }));
  it("allows a manual expense with an item", () => expect(manualExpenseSchema.parse({ ...base, items: [{ name_original: "Coffee", amount: 4.5 }] }).items).toHaveLength(1));
  it("allows a manual expense with an adjustment", () => expect(manualExpenseSchema.parse({ ...base, adjustments: [{ name: "Coupon", amount: -1 }] }).adjustments[0]).toMatchObject({ amount: -1, category: "餐飲" }));
  it("applies all manual item compatibility defaults", () => expect(manualExpenseSchema.parse({ ...base, items: [{ amount: 4.5 }] }).items[0]).toEqual({ name_original: "N/A", name_normalized: "N/A", english_name: "N/A", brand: "N/A", product_group: "其他", category: "餐飲", quantity: 1, amount: 4.5, confidence: 1, notes: "", unit: "N/A", unit_quantity: 1 }));
  it("calculates an item and negative-adjustment difference in cents", () => expect(itemizedDifferenceCents(manualExpenseSchema.parse({ ...base, total_amount: 9, items: [{ amount: 10 }], adjustments: [{ name: "Coupon", amount: -1 }] }))).toBe(0));
});
