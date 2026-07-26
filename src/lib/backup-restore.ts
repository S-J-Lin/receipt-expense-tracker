import { z } from "zod";
import { moneyToCents } from "@/lib/money";
import { normalizeProductAlias } from "@/lib/product-aliases";
import { EXPENSE_CATEGORIES, EXPENSE_SOURCES, type ExpenseWithDetails, type ProductAlias } from "@/types/expense";

export const BACKUP_MAX_BYTES = 25 * 1024 * 1024;
export const SUPPORTED_BACKUP_MAJOR = 1;
export const SUPPORTED_BACKUP_MINOR = 0;
export const RESTORE_MODES = ["skip", "merge", "replace"] as const;
export type RestoreMode = (typeof RESTORE_MODES)[number];

const category = z.enum(EXPENSE_CATEGORIES);
const source = z.enum(EXPENSE_SOURCES);
const optionalText = z.string().nullable().optional();
const timestamp = z.string().datetime({ offset: true });
const receiptPath = z.string().max(1000).refine((value) => !value.includes("..") && !value.includes("://") && !value.includes("?") && !value.includes("#"), "收據路徑格式不安全。").nullable().optional();

const backupItemSchema = z.strictObject({
  name_original: optionalText, name_normalized: optionalText, english_name: optionalText,
  brand: optionalText, product_group: optionalText, category: category.optional(),
  quantity: z.number().finite().positive().optional(), amount: z.number().finite().nonnegative(),
  confidence: z.number().finite().min(0).max(1).nullable().optional(), notes: optionalText,
  unit: optionalText, unit_quantity: z.number().finite().positive().nullable().optional(),
}).transform((item) => ({
  name_original: item.name_original?.trim() || "N/A", name_normalized: item.name_normalized?.trim() || "N/A",
  english_name: item.english_name?.trim() || "N/A", brand: item.brand?.trim() || "N/A",
  product_group: item.product_group?.trim() || "其他", category: item.category ?? "其他",
  quantity: item.quantity ?? 1, amount: item.amount, confidence: item.confidence ?? null,
  notes: item.notes?.trim() || "", unit: item.unit?.trim() || "N/A", unit_quantity: item.unit_quantity ?? 1,
}));

const backupAdjustmentSchema = z.strictObject({
  name: z.string().trim().min(1), amount: z.number().finite(), category: category.optional(),
}).transform((adjustment) => ({ ...adjustment, category: adjustment.category ?? "其他" as const }));

const backupExpenseSchema = z.strictObject({
  id: z.string().uuid(), merchant: z.string().trim().min(1).max(200),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.number().finite().positive(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  category: category, payment_method: optionalText, source: source.optional().default("manual"), notes: optionalText,
  receipt_image_path: receiptPath, raw_receipt_text: optionalText, ai_confidence: z.number().min(0).max(1).nullable().optional(),
  import_warnings: z.array(z.string()).optional().default([]), created_at: timestamp.optional(), updated_at: timestamp.optional(),
  items: z.array(backupItemSchema).optional().default([]), adjustments: z.array(backupAdjustmentSchema).optional().default([]),
});

const aliasSchema = z.strictObject({
  alias: z.string().trim().min(1), normalized_name: z.string().trim().min(1),
  product_group: optionalText, category: category.nullable().optional(), brand: optionalText,
}).transform((alias) => ({ ...alias, product_group: alias.product_group?.trim() || "其他", brand: alias.brand?.trim() || "N/A", category: alias.category ?? null }));

export const backupSchema = z.strictObject({
  export_version: z.string().regex(/^\d+\.\d+$/), generated_at: timestamp,
  date_range: z.strictObject({ start: z.string().nullable(), end: z.string().nullable() }),
  expenses: z.array(backupExpenseSchema), product_aliases: z.array(aliasSchema).optional().default([]),
});

export type ReceiptTrackerBackup = z.output<typeof backupSchema>;
export type DuplicateClassification = "exact" | "probable" | "unique";
export type RestorePreview = {
  expense_count: number; item_count: number; adjustment_count: number; alias_count: number;
  currencies: Record<string, number>; exact_duplicates: number; probable_duplicates: number;
  unique_records: number; merge_records: number; alias_duplicates: number; alias_conflicts: Array<{ alias: string; existing: string; backup: string }>;
  missing_attachments: string[]; existing_expense_count: number; existing_item_count: number;
  existing_adjustment_count: number; existing_alias_count: number; estimated_restore_bytes: number;
  classifications: Array<{ backup_id: string; existing_id: string | null; classification: DuplicateClassification }>;
};

export function restoreModePlan(preview: RestorePreview, mode: RestoreMode) {
  if (mode === "replace") return { add: preview.expense_count, skip: 0, merge: 0, delete_all: true, requires_restore_confirmation: true };
  if (mode === "merge") return { add: preview.unique_records, skip: 0, merge: preview.merge_records, delete_all: false, requires_restore_confirmation: false };
  return { add: preview.unique_records, skip: preview.exact_duplicates + preview.probable_duplicates, merge: 0, delete_all: false, requires_restore_confirmation: false };
}

const dangerousKeys = new Set(["__proto__", "prototype", "constructor"]);
const forbiddenKeys = new Set(["receipt_image_url", "signed_url", "signedUrl", "session_token", "access_token", "service_role_key", "supabase_key", "import_idempotency_key", "creation_idempotency_key"]);

function unsafeKey(value: unknown, path = "JSON"): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) { const found = unsafeKey(value[index], `${path}.${index}`); if (found) return found; }
    return null;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (dangerousKeys.has(key) || forbiddenKeys.has(key) || /secret|session.?token|signed.?url/i.test(key)) return `${path}.${key}`;
    const found = unsafeKey(child, `${path}.${key}`); if (found) return found;
  }
  return null;
}

export type BackupParseResult = { data: ReceiptTrackerBackup | null; errors: string[]; warnings: string[] };

export function parseBackupText(raw: string): BackupParseResult {
  if (new TextEncoder().encode(raw).byteLength > BACKUP_MAX_BYTES) return { data: null, errors: ["備份檔超過 25 MB。"], warnings: [] };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { data: null, errors: ["JSON 格式無效。"], warnings: [] }; }
  const unsafe = unsafeKey(value);
  if (unsafe) return { data: null, errors: [`備份含有不允許或不安全的欄位：${unsafe}`], warnings: [] };
  const parsed = backupSchema.safeParse(value);
  if (!parsed.success) return { data: null, errors: parsed.error.issues.slice(0, 10).map((issue) => `${issue.path.join(".") || "JSON"}：${issue.message}`), warnings: [] };
  const [major, minor] = parsed.data.export_version.split(".").map(Number);
  if (major !== SUPPORTED_BACKUP_MAJOR) return { data: null, errors: [`不支援 export major version ${major}。目前只支援 1.x。`], warnings: [] };
  const warnings = minor > SUPPORTED_BACKUP_MINOR ? [`export_version ${parsed.data.export_version} 比目前支援的 1.0 新，將以相容模式嘗試還原。`] : [];
  return { data: parsed.data, errors: [], warnings };
}

function itemSignature(items: ReceiptTrackerBackup["expenses"][number]["items"]): string {
  return items.map((item) => [item.name_original, item.name_normalized, item.brand, item.product_group, item.category, item.quantity, moneyToCents(item.amount)].join("|")).sort().join("::");
}
function adjustmentSignature(items: ReceiptTrackerBackup["expenses"][number]["adjustments"]): string {
  return items.map((item) => [item.name, item.category, moneyToCents(item.amount)].join("|")).sort().join("::");
}
function existingItemSignature(items: ExpenseWithDetails["expense_items"]): string {
  return items.map((item) => [item.name_original ?? "N/A", item.name_normalized ?? "N/A", item.brand || "N/A", item.product_group ?? "其他", item.category, item.quantity ?? 1, moneyToCents(item.amount)].join("|")).sort().join("::");
}
function existingAdjustmentSignature(items: ExpenseWithDetails["expense_adjustments"]): string {
  return items.map((item) => [item.name, item.category, moneyToCents(item.amount)].join("|")).sort().join("::");
}
function headerMatches(backup: ReceiptTrackerBackup["expenses"][number], existing: ExpenseWithDetails): boolean {
  return backup.merchant.trim().toLocaleLowerCase() === existing.merchant.trim().toLocaleLowerCase()
    && backup.expense_date === existing.expense_date && moneyToCents(backup.amount) === moneyToCents(existing.amount)
    && backup.currency === existing.currency && backup.source === existing.source;
}
function detailsMatch(backup: ReceiptTrackerBackup["expenses"][number], existing: ExpenseWithDetails): boolean {
  return itemSignature(backup.items) === existingItemSignature(existing.expense_items)
    && adjustmentSignature(backup.adjustments) === existingAdjustmentSignature(existing.expense_adjustments);
}

export function buildRestorePreview(backup: ReceiptTrackerBackup, existingExpenses: ExpenseWithDetails[], existingAliases: ProductAlias[], missingAttachments: string[] = []): RestorePreview {
  const classifications: RestorePreview["classifications"] = [];
  for (const expense of backup.expenses) {
    const idMatch = existingExpenses.find((existing) => existing.id === expense.id);
    const headerMatch = idMatch ?? existingExpenses.find((existing) => headerMatches(expense, existing));
    classifications.push({ backup_id: expense.id, existing_id: headerMatch?.id ?? null,
      classification: !headerMatch ? "unique" : headerMatches(expense, headerMatch) && detailsMatch(expense, headerMatch) ? "exact" : "probable" });
  }
  let aliasDuplicates = 0;
  const aliasConflicts: RestorePreview["alias_conflicts"] = [];
  for (const alias of backup.product_aliases) {
    const existing = existingAliases.find((value) => value.alias_normalized === normalizeProductAlias(alias.alias));
    if (!existing) continue;
    if (existing.normalized_name === alias.normalized_name) aliasDuplicates += 1;
    else aliasConflicts.push({ alias: alias.alias, existing: existing.normalized_name, backup: alias.normalized_name });
  }
  const currencies: Record<string, number> = {};
  for (const expense of backup.expenses) currencies[expense.currency] = (currencies[expense.currency] ?? 0) + 1;
  return {
    expense_count: backup.expenses.length, item_count: backup.expenses.reduce((sum, value) => sum + value.items.length, 0),
    adjustment_count: backup.expenses.reduce((sum, value) => sum + value.adjustments.length, 0), alias_count: backup.product_aliases.length,
    currencies, exact_duplicates: classifications.filter((value) => value.classification === "exact").length,
    probable_duplicates: classifications.filter((value) => value.classification === "probable").length,
    unique_records: classifications.filter((value) => value.classification === "unique").length,
    merge_records: classifications.filter((value) => value.classification !== "unique").length,
    alias_duplicates: aliasDuplicates, alias_conflicts: aliasConflicts, missing_attachments: missingAttachments,
    existing_expense_count: existingExpenses.length, existing_item_count: existingExpenses.reduce((sum, value) => sum + value.expense_items.length, 0),
    existing_adjustment_count: existingExpenses.reduce((sum, value) => sum + value.expense_adjustments.length, 0), existing_alias_count: existingAliases.length,
    estimated_restore_bytes: new TextEncoder().encode(JSON.stringify(backup)).byteLength, classifications,
  };
}
