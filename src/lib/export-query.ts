import { EXPENSE_CATEGORIES, EXPENSE_SOURCES } from "@/types/expense";
import type { ExportFilters } from "@/lib/export";
import { isRealIsoDate, localIsoDate, monthStartOffset } from "@/lib/local-date";

export type ExportRange = "month" | "3m" | "6m" | "year" | "all" | "custom";
export const EXPORT_RANGES: ExportRange[] = ["all", "month", "3m", "6m", "year", "custom"];

/** Preset bounds, computed from the Europe/Berlin calendar date (never UTC). */
export function rangeBounds(range: ExportRange, now = new Date()): Pick<ExportFilters, "start" | "end"> {
  const today = localIsoDate(now);
  if (range === "all" || range === "custom") return {};
  if (range === "month") return { start: monthStartOffset(today, 0), end: today };
  if (range === "year") return { start: `${today.slice(0, 4)}-01-01`, end: today };
  return { start: monthStartOffset(today, range === "3m" ? -2 : -5), end: today };
}

type Query = URLSearchParams | Record<string, string | string[] | undefined>;
function one(query: Query, key: string): string | undefined {
  const value = query instanceof URLSearchParams ? query.get(key) ?? undefined : query[key];
  const single = Array.isArray(value) ? value[0] : value;
  return single?.trim() || undefined;
}

export type ParsedExportQuery = { range: ExportRange; filters: ExportFilters; error: string | null };

/**
 * Resolves the effective export range. Dates the user typed always win: if a
 * start or end date is present the range becomes `custom`, so a typed date is
 * never silently ignored. Invalid dates are reported instead of guessed.
 */
export function parseExportQuery(query: Query, now = new Date()): ParsedExportQuery {
  const rawRange = one(query, "range");
  const requested: ExportRange = EXPORT_RANGES.includes(rawRange as ExportRange) ? rawRange as ExportRange : "all";
  const rawStart = one(query, "start");
  const rawEnd = one(query, "end");
  const category = one(query, "category");
  const source = one(query, "source");
  const shared: ExportFilters = {
    merchant: one(query, "merchant"),
    category: EXPENSE_CATEGORIES.includes(category as never) ? category as ExportFilters["category"] : undefined,
    product_group: one(query, "product_group"),
    brand: one(query, "brand"),
    source: EXPENSE_SOURCES.includes(source as never) ? source as ExportFilters["source"] : undefined,
  };
  if (rawStart || rawEnd || requested === "custom") {
    const errors: string[] = [];
    if (rawStart && !isRealIsoDate(rawStart)) errors.push("開始日期無效");
    if (rawEnd && !isRealIsoDate(rawEnd)) errors.push("結束日期無效");
    if (!errors.length && rawStart && rawEnd && rawStart > rawEnd) errors.push("開始日期晚於結束日期");
    return { range: "custom", filters: { ...shared, start: isRealIsoDate(rawStart) ? rawStart : undefined, end: isRealIsoDate(rawEnd) ? rawEnd : undefined }, error: errors.length ? `${errors.join("、")}，請修正後再匯出。` : null };
  }
  return { range: requested, filters: { ...shared, ...rangeBounds(requested, now) }, error: null };
}

/** Query string for download links; preset ranges keep only `range`, custom keeps the dates. */
export function filtersToSearchParams(range: ExportRange, filters: ExportFilters): URLSearchParams {
  const params = new URLSearchParams({ range });
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    if ((key === "start" || key === "end") && range !== "custom") continue;
    params.set(key, value);
  }
  return params;
}

export function hasAnyExportFilter(filters: ExportFilters): boolean {
  return Boolean(filters.start || filters.end || filters.merchant || filters.category || filters.product_group || filters.brand || filters.source);
}
