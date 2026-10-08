import { describe, expect, it } from "vitest";
import { itemBrand, itemProductGroup, optionalItemText } from "@/lib/item-display";
import { calculateItemAnalytics, filterItemPurchases, type ItemPurchase } from "@/lib/item-analytics";

describe("legacy item presentation", () => {
  it("uses consistent missing brand and product group labels", () => {
    for (const value of [null, undefined, "", "  "]) { expect(itemBrand(value)).toBe("N/A"); expect(itemProductGroup(value)).toBe("其他"); }
    expect(itemBrand("Pril")).toBe("Pril"); expect(itemProductGroup("清潔用品")).toBe("清潔用品");
  });
  it("hides missing English names and units without hiding real text", () => {
    for (const value of [null, undefined, "", " N/A "]) expect(optionalItemText(value)).toBeNull();
    expect(optionalItemText("Dish soap")).toBe("Dish soap"); expect(optionalItemText("ml")).toBe("ml");
  });
  it("groups legacy missing brands together without modifying amounts or records", () => {
    const items = [null, "", "N/A"].map((brand, index) => ({ id: String(index), brand, product_group: null, amount: 1.23, currency: "EUR", merchant: "TEST", expense_date: "2026-10-08" })) as ItemPurchase[];
    const original = JSON.stringify(items);
    expect(calculateItemAnalytics(items).byBrand).toEqual([["N/A", 369]]);
    expect(filterItemPurchases(items, { productGroup: "其他", brand: "N/A" })).toHaveLength(3);
    expect(JSON.stringify(items)).toBe(original);
  });
});
