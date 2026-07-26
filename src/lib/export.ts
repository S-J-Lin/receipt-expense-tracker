import type { ExpenseCategory, ExpenseSource, ExpenseWithDetails, ProductAlias } from "@/types/expense";
import { moneyToCents } from "@/lib/money";

export const EXPORT_VERSION = "1.0";
export const EXPORT_FORMATS = ["expenses-csv", "items-csv", "full-json", "chatgpt-json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export type ExportFilters = {
  start?: string;
  end?: string;
  merchant?: string;
  category?: ExpenseCategory;
  product_group?: string;
  brand?: string;
  source?: ExpenseSource;
};

export type ExportDataset = { expenses: ExpenseWithDetails[]; aliases: ProductAlias[] };

const text = (value: string | null | undefined, fallback = "N/A") => value?.trim() || fallback;
const matches = (value: string | null | undefined, query: string | undefined) => !query || (value ?? "").toLocaleLowerCase().includes(query.toLocaleLowerCase());

export function filterExportDataset(dataset: ExportDataset, filters: ExportFilters): ExportDataset {
  const expenses = dataset.expenses.filter((expense) => {
    if (filters.start && expense.expense_date < filters.start) return false;
    if (filters.end && expense.expense_date > filters.end) return false;
    if (!matches(expense.merchant, filters.merchant)) return false;
    if (filters.source && expense.source !== filters.source) return false;
    if (filters.category && expense.category !== filters.category
      && !expense.expense_items.some((item) => item.category === filters.category)
      && !expense.expense_adjustments.some((item) => item.category === filters.category)) return false;
    if (filters.product_group && !expense.expense_items.some((item) => matches(item.product_group, filters.product_group))) return false;
    if (filters.brand && !expense.expense_items.some((item) => matches(item.brand, filters.brand))) return false;
    return true;
  });
  return { expenses, aliases: dataset.aliases };
}

export function csvCell(value: unknown): string {
  const rendered = value == null ? "" : String(value);
  return /[",\r\n]/.test(rendered) ? `"${rendered.replaceAll('"', '""')}"` : rendered;
}

function csv(rows: unknown[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function buildExpensesCsv(dataset: ExportDataset): string {
  const header = ["expense_id", "expense_date", "merchant", "amount", "currency", "category", "payment_method", "source", "notes", "itemized", "created_at", "updated_at"];
  const rows = dataset.expenses.map((expense) => [expense.id, expense.expense_date, expense.merchant, expense.amount.toFixed(2), expense.currency, expense.category, expense.payment_method ?? "", expense.source, expense.notes ?? "", expense.expense_items.length > 0 || expense.expense_adjustments.length > 0, expense.created_at, expense.updated_at]);
  return csv([header, ...rows]);
}

export function buildItemsCsv(dataset: ExportDataset): string {
  const header = ["expense_id", "expense_date", "merchant", "currency", "record_type", "name_original", "name_normalized", "english_name", "brand", "product_group", "category", "quantity", "amount", "confidence", "unit", "unit_quantity", "notes", "source"];
  const rows: unknown[][] = [];
  for (const expense of dataset.expenses) {
    for (const item of expense.expense_items) rows.push([
      expense.id, expense.expense_date, expense.merchant, expense.currency, "item",
      text(item.name_original), text(item.name_normalized), text(item.english_name), text(item.brand), text(item.product_group, "其他"),
      item.category, item.quantity ?? 1, item.amount.toFixed(2), item.confidence ?? "", text(item.unit), item.unit_quantity ?? 1, item.notes ?? "", expense.source,
    ]);
    for (const adjustment of expense.expense_adjustments) rows.push([
      expense.id, expense.expense_date, expense.merchant, expense.currency, "adjustment",
      adjustment.name, "", "", "", "", adjustment.category, "", adjustment.amount.toFixed(2), "", "", "", "", expense.source,
    ]);
  }
  return csv([header, ...rows]);
}

function safeItem(item: ExpenseWithDetails["expense_items"][number]) {
  return {
    name_original: text(item.name_original), name_normalized: text(item.name_normalized), english_name: text(item.english_name),
    brand: text(item.brand), product_group: text(item.product_group, "其他"), category: item.category,
    quantity: item.quantity ?? 1, amount: item.amount, confidence: item.confidence,
    notes: item.notes ?? "", unit: text(item.unit), unit_quantity: item.unit_quantity ?? 1,
  };
}

function safeAdjustment(item: ExpenseWithDetails["expense_adjustments"][number]) {
  return { name: item.name, amount: item.amount, category: item.category };
}

const range = (filters: ExportFilters) => ({ start: filters.start ?? null, end: filters.end ?? null });

export function buildFullBackup(dataset: ExportDataset, filters: ExportFilters, generatedAt = new Date().toISOString()) {
  return {
    export_version: EXPORT_VERSION,
    generated_at: generatedAt,
    date_range: range(filters),
    expenses: dataset.expenses.map((expense) => ({
      id: expense.id, merchant: expense.merchant, expense_date: expense.expense_date, amount: expense.amount,
      currency: expense.currency, category: expense.category, payment_method: expense.payment_method,
      source: expense.source, notes: expense.notes, receipt_image_path: expense.receipt_image_path,
      raw_receipt_text: expense.raw_receipt_text, ai_confidence: expense.ai_confidence,
      import_warnings: expense.import_warnings, created_at: expense.created_at, updated_at: expense.updated_at,
      items: expense.expense_items.map(safeItem), adjustments: expense.expense_adjustments.map(safeAdjustment),
    })),
    product_aliases: dataset.aliases.map((alias) => ({ alias: alias.alias, normalized_name: alias.normalized_name, product_group: alias.product_group ?? "其他", category: alias.category, brand: text(alias.brand) })),
  };
}

export function buildChatGPTBundle(dataset: ExportDataset, filters: ExportFilters, generatedAt = new Date().toISOString()) {
  const totalByCurrencyCents: Record<string, number> = {};
  let itemCount = 0;
  let adjustmentCount = 0;
  let reconciledExpenseCount = 0;
  let unreconciledExpenseCount = 0;
  const purchases = dataset.expenses.map((expense) => {
    const itemTotalCents = expense.expense_items.reduce((sum, item) => sum + moneyToCents(item.amount), 0);
    const adjustmentTotalCents = expense.expense_adjustments.reduce((sum, adjustment) => sum + moneyToCents(adjustment.amount), 0);
    const calculatedDetailTotalCents = itemTotalCents + adjustmentTotalCents;
    const expenseTotalCents = moneyToCents(expense.amount);
    const differenceCents = calculatedDetailTotalCents - expenseTotalCents;
    const matches = Math.abs(differenceCents) <= 1;
    if (matches) reconciledExpenseCount += 1;
    else unreconciledExpenseCount += 1;
    const warnings = [...expense.import_warnings];
    if (!matches) warnings.push(`明細合計與消費總額相差 ${(differenceCents / 100).toFixed(2)} ${expense.currency}，請以原始資料為準。`);
    return {
      expense_date: expense.expense_date, merchant: expense.merchant, currency: expense.currency,
      expense_total: expense.amount, category: expense.category, payment_method: expense.payment_method,
      source: expense.source, notes: expense.notes ?? "", items: expense.expense_items.map(safeItem),
      adjustments: expense.expense_adjustments.map(safeAdjustment), warnings,
      reconciliation: {
        item_total: itemTotalCents / 100,
        adjustment_total: adjustmentTotalCents / 100,
        calculated_detail_total: calculatedDetailTotalCents / 100,
        expense_total: expenseTotalCents / 100,
        difference: differenceCents / 100,
        matches,
      },
    };
  });
  for (const expense of dataset.expenses) {
    totalByCurrencyCents[expense.currency] = (totalByCurrencyCents[expense.currency] ?? 0) + moneyToCents(expense.amount);
    itemCount += expense.expense_items.length;
    adjustmentCount += expense.expense_adjustments.length;
  }
  const totalByCurrency = Object.fromEntries(Object.entries(totalByCurrencyCents).map(([currency, cents]) => [currency, cents / 100]));
  return {
    dataset: "Receipt Tracker purchase history",
    export_version: EXPORT_VERSION,
    generated_at: generatedAt,
    currency_notes: "Amounts retain their original currencies. Different currencies are never added together.",
    date_range: range(filters),
    filters: { merchant: filters.merchant ?? null, category: filters.category ?? null, product_group: filters.product_group ?? null, brand: filters.brand ?? null, source: filters.source ?? null },
    summary: { expense_count: dataset.expenses.length, item_count: itemCount, adjustment_count: adjustmentCount,
      reconciled_expense_count: reconciledExpenseCount, unreconciled_expense_count: unreconciledExpenseCount,
      total_by_currency: totalByCurrency },
    purchases,
    aliases: dataset.aliases.map((alias) => ({ alias: alias.alias, normalized_name: alias.normalized_name, product_group: alias.product_group ?? "其他", category: alias.category, brand: text(alias.brand) })),
  };
}

export function exportFilename(format: ExportFormat, filters: ExportFilters, today = new Date().toISOString().slice(0, 10)): string {
  const scope = filters.start || filters.end ? `${filters.start ?? "beginning"}_to_${filters.end ?? today}` : "all";
  const extension = format.endsWith("csv") ? "csv" : "json";
  return `receipt-tracker_${format}_${scope}_${today}.${extension}`;
}

export function exportContent(format: ExportFormat, dataset: ExportDataset, filters: ExportFilters): { body: string; contentType: string } {
  if (format === "expenses-csv") return { body: buildExpensesCsv(dataset), contentType: "text/csv; charset=utf-8" };
  if (format === "items-csv") return { body: buildItemsCsv(dataset), contentType: "text/csv; charset=utf-8" };
  const value = format === "full-json" ? buildFullBackup(dataset, filters) : buildChatGPTBundle(dataset, filters);
  return { body: JSON.stringify(value, null, 2), contentType: "application/json; charset=utf-8" };
}

export function exportResponseHeaders(format: ExportFormat, filters: ExportFilters): Record<string, string> {
  const contentType = format.endsWith("csv") ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${exportFilename(format, filters)}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

export function exportPreview(dataset: ExportDataset, filters: ExportFilters) {
  const sources = new Map<ExpenseSource, number>();
  const currencies = new Set<string>();
  let itemCount = 0;
  let adjustmentCount = 0;
  for (const expense of dataset.expenses) {
    sources.set(expense.source, (sources.get(expense.source) ?? 0) + 1);
    currencies.add(expense.currency);
    itemCount += expense.expense_items.length;
    adjustmentCount += expense.expense_adjustments.length;
  }
  return { expenseCount: dataset.expenses.length, itemCount, adjustmentCount, sources, currencies, estimatedBytes: JSON.stringify(buildFullBackup(dataset, filters)).length };
}
