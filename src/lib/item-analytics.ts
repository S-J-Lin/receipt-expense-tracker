import { moneyToCents } from "@/lib/money";
import type { ExpenseCategory, ExpenseItem } from "@/types/expense";

export type ItemPurchase = ExpenseItem & { merchant: string; expense_date: string; currency: string };
export type ItemSearchFilters = { query?: string; start?: string; end?: string; merchant?: string;
  brand?: string; productGroup?: string; category?: ExpenseCategory; aliasNormalizedNames?: string[] };

function includes(value: string | null | undefined, query: string): boolean { return Boolean(value?.toLocaleLowerCase().includes(query)); }

export function filterItemPurchases(items: ItemPurchase[], filters: ItemSearchFilters): ItemPurchase[] {
  const query = filters.query?.trim().toLocaleLowerCase();
  const aliasNames = new Set(filters.aliasNormalizedNames?.map((name) => name.toLocaleLowerCase()));
  return items.filter((item) => {
    if (filters.start && item.expense_date < filters.start) return false;
    if (filters.end && item.expense_date > filters.end) return false;
    if (filters.merchant && !includes(item.merchant, filters.merchant.toLocaleLowerCase())) return false;
    if (filters.brand && !includes(item.brand, filters.brand.toLocaleLowerCase())) return false;
    if (filters.productGroup && !includes(item.product_group, filters.productGroup.toLocaleLowerCase())) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (!query) return true;
    return includes(item.name_original, query) || includes(item.name_normalized, query) || includes(item.english_name, query)
      || includes(item.brand, query) || includes(item.product_group, query)
      || (item.name_normalized ? aliasNames.has(item.name_normalized.toLocaleLowerCase()) : false);
  });
}

export function calculateItemAnalytics(items: ItemPurchase[]) {
  const totalCents = items.reduce((sum, item) => sum + moneyToCents(item.amount), 0);
  const prices = items.map((item) => moneyToCents(item.amount));
  const breakdown = (key: (item: ItemPurchase) => string) => {
    const result = new Map<string, number>();
    for (const item of items) { const name = key(item) || "未指定"; result.set(name, (result.get(name) ?? 0) + moneyToCents(item.amount)); }
    return [...result.entries()].sort((a, b) => b[1] - a[1]);
  };
  return { totalCents, count: items.length, averageCents: items.length ? Math.round(totalCents / items.length) : 0,
    minCents: prices.length ? Math.min(...prices) : 0, maxCents: prices.length ? Math.max(...prices) : 0,
    latestDate: items.map((item) => item.expense_date).sort().reverse()[0] ?? null,
    byBrand: breakdown((item) => item.brand ?? "未指定品牌"), byMerchant: breakdown((item) => item.merchant),
    byMonth: breakdown((item) => item.expense_date.slice(0, 7)),
    byNormalizedName: breakdown((item) => item.name_normalized ?? item.name_original ?? "未命名") };
}

export function resolveDateRange(range: string | undefined, today: string, customStart?: string, customEnd?: string) {
  const end = range === "custom" && customEnd ? customEnd : today;
  if (range === "custom") return { start: customStart, end };
  const date = new Date(`${today}T00:00:00Z`);
  if (range === "30d") date.setUTCDate(date.getUTCDate() - 29);
  else if (range === "6m") date.setUTCMonth(date.getUTCMonth() - 6);
  else if (range === "year") return { start: `${today.slice(0, 4)}-01-01`, end };
  else date.setUTCMonth(date.getUTCMonth() - 3);
  return { start: date.toISOString().slice(0, 10), end };
}
