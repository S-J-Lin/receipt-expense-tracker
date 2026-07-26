import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRestorePreview, parseBackupText, restoreModePlan, type ReceiptTrackerBackup } from "@/lib/backup-restore";
import { buildFullBackup } from "@/lib/export";
import type { ExpenseWithDetails, ProductAlias } from "@/types/expense";

const id1 = "00000000-0000-4000-8000-000000000001";
const id2 = "00000000-0000-4000-8000-000000000002";
const generated = "2026-07-26T12:00:00.000Z";
const baseExpense = { id: id1, merchant: "REWE", expense_date: "2026-07-21", amount: 9, currency: "EUR", category: "食品雜貨" as const, payment_method: "VISA", source: "chatgpt_import" as const, notes: null, receipt_image_path: null, raw_receipt_text: null, ai_confidence: null, import_warnings: [], created_at: generated, updated_at: generated, items: [{ name_original: "MILCH", name_normalized: "牛奶", english_name: "Milk", brand: "JA!", product_group: "乳製品", category: "食品雜貨" as const, quantity: 1, amount: 10, confidence: .9, notes: "", unit: "L", unit_quantity: 1 }], adjustments: [{ name: "Coupon", amount: -1, category: "食品雜貨" as const }] };
const backupObject = { export_version: "1.0", generated_at: generated, date_range: { start: "2026-07-01", end: "2026-07-31" }, expenses: [baseExpense], product_aliases: [{ alias: "H-MILCH", normalized_name: "牛奶", product_group: "乳製品", category: "食品雜貨" as const, brand: "JA!" }] };
const parsedBackup = parseBackupText(JSON.stringify(backupObject)).data as ReceiptTrackerBackup;

function existing(overrides: Partial<ExpenseWithDetails> = {}): ExpenseWithDetails {
  return { id: id1, user_id: null, merchant: "REWE", expense_date: "2026-07-21", amount: 9, currency: "EUR", category: "食品雜貨", payment_method: "VISA", receipt_image_url: null, receipt_image_path: null, raw_receipt_text: null, ai_confidence: null, notes: null, source: "chatgpt_import", import_warnings: [], import_idempotency_key: null, creation_idempotency_key: null, created_at: generated, updated_at: generated, expense_items: [{ id: "i", expense_id: id1, name_original: "MILCH", name_normalized: "牛奶", english_name: "Milk", brand: "JA!", product_group: "乳製品", category: "食品雜貨", quantity: 1, amount: 10, confidence: .9, notes: "", unit: "L", unit_quantity: 1, created_at: generated, updated_at: generated }], expense_adjustments: [{ id: "a", expense_id: id1, name: "Coupon", amount: -1, category: "食品雜貨", created_at: generated, updated_at: generated }], ...overrides };
}
const alias: ProductAlias = { id: "alias", alias: "H-MILCH", alias_normalized: "h-milch", normalized_name: "牛奶", product_group: "乳製品", category: "食品雜貨", brand: "JA!", created_at: generated, updated_at: generated };

describe("backup restore", () => {
  it("accepts a valid 1.0 backup", () => expect(parseBackupText(JSON.stringify(backupObject)).data?.expenses).toHaveLength(1));
  it("rejects invalid JSON", () => expect(parseBackupText("{").errors[0]).toContain("JSON"));
  it("rejects an unknown major version", () => expect(parseBackupText(JSON.stringify({ ...backupObject, export_version: "2.0" })).errors[0]).toContain("major"));
  it("warns and attempts an unknown minor version", () => expect(parseBackupText(JSON.stringify({ ...backupObject, export_version: "1.1" })).warnings[0]).toContain("相容模式"));
  it("rejects missing required fields", () => expect(parseBackupText(JSON.stringify({ export_version: "1.0" })).data).toBeNull());
  it("rejects prototype-pollution keys", () => expect(parseBackupText(JSON.stringify({ ...backupObject, expenses: [{ ...baseExpense, __proto_pollution_marker: true }], __proto__: true }).replace('"__proto_pollution_marker"', '"__proto__"')).errors[0]).toContain("不安全"));
  it("classifies an exact duplicate including item and adjustment signatures", () => expect(buildRestorePreview(parsedBackup, [existing()], []).exact_duplicates).toBe(1));
  it("classifies a probable duplicate when the ID or header matches but details differ", () => expect(buildRestorePreview(parsedBackup, [existing({ expense_items: [] })], []).probable_duplicates).toBe(1));
  it("classifies a unique expense", () => expect(buildRestorePreview(parsedBackup, [existing({ id: id2, merchant: "Cafe" })], []).unique_records).toBe(1));
  it("keeps item and adjustment arrays attached to their expense", () => expect(parsedBackup.expenses[0]).toMatchObject({ id: id1, items: [{ amount: 10 }], adjustments: [{ amount: -1 }] }));
  it("detects an alias duplicate", () => expect(buildRestorePreview(parsedBackup, [], [alias]).alias_duplicates).toBe(1));
  it("detects and describes an alias conflict", () => expect(buildRestorePreview(parsedBackup, [], [{ ...alias, normalized_name: "奶粉" }]).alias_conflicts[0]).toMatchObject({ existing: "奶粉", backup: "牛奶" }));
  it("plans skip duplicates", () => expect(restoreModePlan(buildRestorePreview(parsedBackup, [existing()], []), "skip")).toMatchObject({ add: 0, skip: 1, merge: 0 }));
  it("plans conservative merge", () => expect(restoreModePlan(buildRestorePreview(parsedBackup, [existing()], []), "merge")).toMatchObject({ add: 0, merge: 1, delete_all: false }));
  it("plans replace all with destructive confirmation", () => expect(restoreModePlan(buildRestorePreview(parsedBackup, [existing()], []), "replace")).toMatchObject({ add: 1, delete_all: true, requires_restore_confirmation: true }));
  it("requires RESTORE in the atomic SQL contract", () => expect(readFileSync("supabase/migrations/20260726000800_add_atomic_backup_restore.sql", "utf8")).toContain("p_replace_confirmation is distinct from 'RESTORE'"));
  it("implements one atomic function and rollback-safe validation", () => { const sql = readFileSync("supabase/migrations/20260726000800_add_atomic_backup_restore.sql", "utf8"); expect(sql).toContain("restore_receipt_tracker_backup"); expect(sql).not.toContain("commit;"); });
  it("marks missing receipt paths without rejecting the expense", () => expect(buildRestorePreview(parsedBackup, [], [], ["anonymous/missing.jpg"]).missing_attachments).toEqual(["anonymous/missing.jpg"]));
  it("restores manual and ChatGPT sources", () => { const manual = parseBackupText(JSON.stringify({ ...backupObject, expenses: [{ ...baseExpense, source: "manual", items: [] }, baseExpense] })).data; expect(manual?.expenses.map((value) => value.source)).toEqual(["manual", "chatgpt_import"]); });
  it("summarizes multiple currencies", () => { const other = { ...baseExpense, id: id2, currency: "USD" }; expect(buildRestorePreview({ ...parsedBackup, expenses: [parsedBackup.expenses[0], other] }, [], []).currencies).toEqual({ EUR: 1, USD: 1 }); });
  it("supplies defaults for old optional item fields without creating missing rows", () => { const value = parseBackupText(JSON.stringify({ ...backupObject, expenses: [{ ...baseExpense, source: undefined, items: [{ amount: 2 }] }] })).data?.expenses[0]; expect(value).toMatchObject({ source: "manual", items: [{ name_original: "N/A", brand: "N/A", product_group: "其他" }] }); });
  it("accepts a large valid backup below the limit", () => { const many = { ...backupObject, expenses: Array.from({ length: 2000 }, (_, index) => ({ ...baseExpense, id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` })) }; expect(parseBackupText(JSON.stringify(many)).data?.expenses).toHaveLength(2000); });
  it("uses a unique restore key for duplicate-submit reports", () => expect(readFileSync("supabase/migrations/20260726000800_add_atomic_backup_restore.sql", "utf8")).toContain("restore_key uuid not null unique"));
  it("defines a complete import report", () => { const sql = readFileSync("supabase/migrations/20260726000800_add_atomic_backup_restore.sql", "utf8"); for (const key of ["imported_expenses", "imported_items", "imported_adjustments", "imported_aliases", "skipped_duplicates", "merged_records", "conflicts", "duration_ms"]) expect(sql).toContain(`'${key}'`); });
  it("rejects secret and signed URL fields", () => expect(parseBackupText(JSON.stringify({ ...backupObject, service_role_key: "secret" })).errors[0]).toContain("不允許"));
  it("round trips a Full Backup export through validation", () => { const exported = buildFullBackup({ expenses: [existing()], aliases: [alias] }, {}, generated); const restored = parseBackupText(JSON.stringify(exported)); expect(restored.data?.expenses[0]).toMatchObject({ id: id1, items: [{ name_normalized: "牛奶" }], adjustments: [{ amount: -1 }] }); });
});
