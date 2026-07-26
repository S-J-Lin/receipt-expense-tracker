import { describe, expect, it } from "vitest";
import { calculateItemAnalytics, filterItemPurchases, resolveDateRange, type ItemPurchase } from "@/lib/item-analytics";
import { aliasNeedsConfirmation, normalizeProductAlias } from "@/lib/product-aliases";

const base = { expense_id: "e", quantity: 1, category: "日用品" as const, confidence: null,
  created_at: "", updated_at: "", merchant: "dm", expense_date: "2026-07-01", currency: "EUR" };
const items: ItemPurchase[] = [
  { ...base, id: "1", name_original: "Pril Original", name_normalized: "洗碗精", brand: "Pril", product_group: "清潔用品", amount: 4.99 },
  { ...base, id: "2", name_original: "Fairy Ultra", name_normalized: "洗碗精", brand: "Fairy", product_group: "清潔用品", amount: 4.5, expense_date: "2026-06-01", merchant: "REWE" },
  { ...base, id: "3", name_original: "Denkmit Spülmittel", name_normalized: "洗碗精", brand: "Denkmit", product_group: "清潔用品", amount: 5.38, expense_date: "2026-05-01" },
];

describe("item search and analytics", () => {
  it("keeps different brands under one normalized product", () => expect(filterItemPurchases(items, { query: "洗碗精" })).toHaveLength(3));
  it("searches original names", () => expect(filterItemPurchases(items, { query: "spülmittel" })[0]?.brand).toBe("Denkmit"));
  it("searches brands", () => expect(filterItemPurchases(items, { query: "fairy" })[0]?.name_normalized).toBe("洗碗精"));
  it("searches alias-resolved normalized names", () => expect(filterItemPurchases(items, { query: "dish soap", aliasNormalizedNames: ["洗碗精"] })).toHaveLength(3));
  it("filters the last three months", () => { const range = resolveDateRange("3m", "2026-07-26"); expect(filterItemPurchases(items, range)).toHaveLength(3); });
  it("calculates total, count, average, min and max with cents", () => { const stats = calculateItemAnalytics(items); expect(stats).toMatchObject({ totalCents: 1487, count: 3, averageCents: 496, minCents: 450, maxCents: 538 }); });
  it("normalizes duplicate aliases across case and whitespace", () => expect(normalizeProductAlias("  Dish   SOAP ")).toBe("dish soap"));
  it("requires confirmation only when an alias mapping changes", () => { expect(aliasNeedsConfirmation("洗碗精", "洗碗精")).toBe(false); expect(aliasNeedsConfirmation("清潔劑", "洗碗精")).toBe(true); });
});
