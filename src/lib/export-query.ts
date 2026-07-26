import { EXPENSE_CATEGORIES, EXPENSE_SOURCES } from "@/types/expense";
import type { ExportFilters } from "@/lib/export";

export type ExportRange = "month" | "3m" | "6m" | "year" | "all" | "custom";

function iso(date: Date): string { return date.toISOString().slice(0, 10); }
function startOfMonth(date: Date, monthOffset = 0): string { return iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1))); }

export function rangeBounds(range: ExportRange, now = new Date()): Pick<ExportFilters, "start" | "end"> {
  const today = iso(now);
  if (range === "all" || range === "custom") return {};
  if (range === "month") return { start: startOfMonth(now), end: today };
  if (range === "year") return { start: `${now.getUTCFullYear()}-01-01`, end: today };
  return { start: startOfMonth(now, range === "3m" ? -2 : -5), end: today };
}

type Query = URLSearchParams | Record<string, string | string[] | undefined>;
function one(query: Query, key: string): string | undefined {
  const value = query instanceof URLSearchParams ? query.get(key) ?? undefined : query[key];
  return Array.isArray(value) ? value[0] : value;
}

export function parseExportQuery(query: Query, now = new Date()): { range: ExportRange; filters: ExportFilters } {
  const rawRange = one(query, "range");
  const range: ExportRange = ["month", "3m", "6m", "year", "all", "custom"].includes(rawRange ?? "") ? rawRange as ExportRange : "all";
  const bounds = range === "custom" ? { start: one(query, "start"), end: one(query, "end") } : rangeBounds(range, now);
  const category = one(query, "category");
  const source = one(query, "source");
  return { range, filters: {
    ...bounds,
    merchant: one(query, "merchant")?.trim() || undefined,
    category: EXPENSE_CATEGORIES.includes(category as never) ? category as ExportFilters["category"] : undefined,
    product_group: one(query, "product_group")?.trim() || undefined,
    brand: one(query, "brand")?.trim() || undefined,
    source: EXPENSE_SOURCES.includes(source as never) ? source as ExportFilters["source"] : undefined,
  } };
}

export function filtersToSearchParams(range: ExportRange, filters: ExportFilters): URLSearchParams {
  const params = new URLSearchParams({ range });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params;
}
