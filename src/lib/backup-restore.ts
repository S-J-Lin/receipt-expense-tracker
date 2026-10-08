import { z } from "zod";
import { moneyToCents } from "@/lib/money";
import { normalizeProductAlias } from "@/lib/product-aliases";
import { EXPENSE_CATEGORIES, EXPENSE_SOURCES, type ExpenseWithDetails, type ProductAlias } from "@/types/expense";

export const BACKUP_MAX_BYTES = 25 * 1024 * 1024;
export const SUPPORTED_BACKUP_MAJOR = 1;
export const SUPPORTED_BACKUP_MINOR = 1;
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
  recurring_expense_id: z.string().uuid().nullable().optional(), recurring_period: z.iso.date().nullable().optional(),
  items: z.array(backupItemSchema).optional().default([]), adjustments: z.array(backupAdjustmentSchema).optional().default([]),
});

const aliasSchema = z.strictObject({
  alias: z.string().trim().min(1), normalized_name: z.string().trim().min(1),
  product_group: optionalText, category: category.nullable().optional(), brand: optionalText,
}).transform((alias) => ({ ...alias, product_group: alias.product_group?.trim() || "其他", brand: alias.brand?.trim() || "N/A", category: alias.category ?? null }));

const recurringSchema = z.strictObject({
  id: z.string().uuid(), merchant: z.string().trim().min(1), amount: z.number().finite().positive(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()), category,
  payment_method: optionalText, notes: optionalText, recurrence_type: z.literal("monthly").optional().default("monthly"),
  day_of_month: z.number().int().min(1).max(31), start_date: z.iso.date(), end_date: z.iso.date().nullable(),
  is_active: z.boolean(), cancelled_at: timestamp.nullable().optional().default(null), last_generated_for: z.iso.date().nullable(),
  next_run_date: z.iso.date(), source: z.literal("recurring").optional().default("recurring"),
  timezone: z.literal("Europe/Berlin").optional().default("Europe/Berlin"), created_at: timestamp.optional(), updated_at: timestamp.optional(),
}).refine((value) => !value.end_date || value.end_date >= value.start_date, { message: "結束日期不得早於開始日期。", path: ["end_date"] });

const scopeText = z.string().nullable().optional().default(null);
const scopeSchema = z.strictObject({
  is_partial: z.boolean(),
  filters: z.strictObject({ start: scopeText, end: scopeText, merchant: scopeText, category: scopeText, product_group: scopeText, brand: scopeText, source: scopeText }),
  timezone: z.literal("Europe/Berlin").optional(),
});

export const backupSchema = z.strictObject({
  export_version: z.string().regex(/^\d+\.\d+$/), generated_at: timestamp,
  date_range: z.strictObject({ start: z.string().nullable(), end: z.string().nullable() }),
  scope: scopeSchema.optional(),
  expenses: z.array(backupExpenseSchema), product_aliases: z.array(aliasSchema).optional().default([]),
  recurring_expenses: z.array(recurringSchema).optional().default([]),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  value.expenses.forEach((expense, index) => {
    if (seen.has(expense.id)) context.addIssue({ code: "custom", path: ["expenses", index, "id"], message: "備份中有重複的 expense id。" });
    seen.add(expense.id);
  });
  const rules = new Set<string>();
  value.recurring_expenses.forEach((rule, index) => {
    if (rules.has(rule.id)) context.addIssue({ code: "custom", path: ["recurring_expenses", index, "id"], message: "備份中有重複的固定支出規則 id。" });
    rules.add(rule.id);
  });
});

export type ReceiptTrackerBackup = z.output<typeof backupSchema>;
export type DuplicateClassification = "exact" | "probable" | "unique";
export type MatchKind = "id" | "recurring_link" | "signature" | null;
export type RestorePreview = {
  expense_count: number; item_count: number; adjustment_count: number; alias_count: number; recurring_expense_count: number;
  currencies: Record<string, number>; exact_duplicates: number; probable_duplicates: number;
  unique_records: number; merge_records: number; alias_duplicates: number; alias_conflicts: Array<{ alias: string; existing: string; backup: string }>;
  missing_attachments: string[]; existing_expense_count: number; existing_item_count: number;
  existing_adjustment_count: number; existing_alias_count: number; existing_recurring_count: number; estimated_restore_bytes: number;
  /** Backup rows sharing a header signature with another backup row; restored as separate expenses. */
  same_signature_in_backup: number;
  recurring_existing_ids: number; recurring_past_due: number;
  is_partial: boolean; scope_filters: Record<string, string | null> | null;
  classifications: Array<{ backup_id: string; existing_id: string | null; classification: DuplicateClassification; match: MatchKind }>;
};

export type RestorePreviewOptions = { existingRecurringIds?: string[]; existingRecurringCount?: number; today?: string };

/** A backup is partial when its scope says so, or (legacy 1.0 files) when it carries a date range. */
export function isPartialBackup(backup: Pick<ReceiptTrackerBackup, "scope" | "date_range">): boolean {
  if (backup.scope) return backup.scope.is_partial;
  return Boolean(backup.date_range.start || backup.date_range.end);
}

export function restoreModePlan(preview: RestorePreview, mode: RestoreMode) {
  if (mode === "replace") return { add: preview.expense_count, skip: 0, merge: 0, delete_all: true, requires_restore_confirmation: true, blocked: preview.is_partial };
  if (mode === "merge") return { add: preview.unique_records, skip: 0, merge: preview.merge_records, delete_all: false, requires_restore_confirmation: false, blocked: false };
  return { add: preview.unique_records, skip: preview.exact_duplicates + preview.probable_duplicates, merge: 0, delete_all: false, requires_restore_confirmation: false, blocked: false };
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
type BackupExpense = ReceiptTrackerBackup["expenses"][number];
/** Header signature used for probable-duplicate detection (mirrors the restore SQL). */
export function headerSignature(value: { merchant: string; expense_date: string; amount: number; currency: string; source?: string | null }): string {
  return [value.merchant.trim().toLowerCase(), value.expense_date, moneyToCents(value.amount), value.currency.toUpperCase(), value.source ?? "manual"].join("|");
}
function detailsMatch(backup: BackupExpense, existing: ExpenseWithDetails): boolean {
  return itemSignature(backup.items) === existingItemSignature(existing.expense_items)
    && adjustmentSignature(backup.adjustments) === existingAdjustmentSignature(existing.expense_adjustments);
}

/**
 * Matches backup expenses to pre-existing expenses one-to-one, in three passes:
 * 1) same id, 2) same recurring rule + period, 3) same header signature.
 * Each existing expense absorbs at most one backup expense, and backup rows
 * never match each other, so two genuine identical purchases (e.g. two €2.50
 * coffees on one day) are both kept. The restore SQL uses the same rules.
 */
export function matchBackupExpenses(backup: BackupExpense[], existing: ExpenseWithDetails[]): Array<{ backup: BackupExpense; existing: ExpenseWithDetails | null; match: MatchKind }> {
  const byId = new Map(existing.map((value) => [value.id, value]));
  const claimed = new Set<string>();
  const result: Array<{ backup: BackupExpense; existing: ExpenseWithDetails | null; match: MatchKind }> = backup.map((value) => ({ backup: value, existing: null, match: null }));
  for (const row of result) {
    const hit = byId.get(row.backup.id);
    if (hit) { row.existing = hit; row.match = "id"; claimed.add(hit.id); }
  }
  const byLink = new Map<string, ExpenseWithDetails>();
  for (const value of existing) if (value.recurring_expense_id && value.recurring_period) byLink.set(`${value.recurring_expense_id}|${value.recurring_period}`, value);
  for (const row of result) {
    if (row.existing || !row.backup.recurring_expense_id || !row.backup.recurring_period) continue;
    const hit = byLink.get(`${row.backup.recurring_expense_id}|${row.backup.recurring_period}`);
    if (hit && !claimed.has(hit.id)) { row.existing = hit; row.match = "recurring_link"; claimed.add(hit.id); }
  }
  const bySignature = new Map<string, ExpenseWithDetails[]>();
  const ordered = [...existing].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  for (const value of ordered) {
    const key = headerSignature(value);
    const list = bySignature.get(key);
    if (list) list.push(value); else bySignature.set(key, [value]);
  }
  for (const row of result) {
    if (row.existing) continue;
    const candidate = bySignature.get(headerSignature(row.backup))?.find((value) => !claimed.has(value.id));
    if (candidate) { row.existing = candidate; row.match = "signature"; claimed.add(candidate.id); }
  }
  return result;
}

export function buildRestorePreview(backup: ReceiptTrackerBackup, existingExpenses: ExpenseWithDetails[], existingAliases: ProductAlias[], missingAttachments: string[] = [], options: RestorePreviewOptions = {}): RestorePreview {
  const classifications: RestorePreview["classifications"] = matchBackupExpenses(backup.expenses, existingExpenses).map(({ backup: value, existing, match }) => ({
    backup_id: value.id, existing_id: existing?.id ?? null, match,
    classification: !existing ? "unique" : headerSignature(value) === headerSignature(existing) && detailsMatch(value, existing) ? "exact" : "probable",
  }));
  const signatureCounts = new Map<string, number>();
  for (const value of backup.expenses) signatureCounts.set(headerSignature(value), (signatureCounts.get(headerSignature(value)) ?? 0) + 1);
  const sameSignature = backup.expenses.filter((value) => (signatureCounts.get(headerSignature(value)) ?? 0) > 1).length;
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
  const existingRuleIds = new Set(options.existingRecurringIds ?? []);
  const today = options.today;
  return {
    expense_count: backup.expenses.length, item_count: backup.expenses.reduce((sum, value) => sum + value.items.length, 0),
    adjustment_count: backup.expenses.reduce((sum, value) => sum + value.adjustments.length, 0), alias_count: backup.product_aliases.length, recurring_expense_count: backup.recurring_expenses.length,
    currencies, exact_duplicates: classifications.filter((value) => value.classification === "exact").length,
    probable_duplicates: classifications.filter((value) => value.classification === "probable").length,
    unique_records: classifications.filter((value) => value.classification === "unique").length,
    merge_records: classifications.filter((value) => value.classification !== "unique").length,
    alias_duplicates: aliasDuplicates, alias_conflicts: aliasConflicts, missing_attachments: missingAttachments,
    existing_expense_count: existingExpenses.length, existing_item_count: existingExpenses.reduce((sum, value) => sum + value.expense_items.length, 0),
    existing_adjustment_count: existingExpenses.reduce((sum, value) => sum + value.expense_adjustments.length, 0), existing_alias_count: existingAliases.length,
    existing_recurring_count: options.existingRecurringCount ?? existingRuleIds.size,
    estimated_restore_bytes: new TextEncoder().encode(JSON.stringify(backup)).byteLength,
    same_signature_in_backup: sameSignature,
    recurring_existing_ids: backup.recurring_expenses.filter((rule) => existingRuleIds.has(rule.id)).length,
    recurring_past_due: today ? backup.recurring_expenses.filter((rule) => rule.is_active && !rule.cancelled_at && rule.next_run_date < today).length : 0,
    is_partial: isPartialBackup(backup), scope_filters: backup.scope?.filters ?? (backup.date_range.start || backup.date_range.end ? { start: backup.date_range.start, end: backup.date_range.end } : null),
    classifications,
  };
}

/** Stable SHA-256 of the validated backup and mode; binds a restore key to one operation. */
export async function restorePayloadHash(backup: ReceiptTrackerBackup, mode: RestoreMode): Promise<string> {
  const bytes = new TextEncoder().encode(`${mode}\n${JSON.stringify(backup)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
