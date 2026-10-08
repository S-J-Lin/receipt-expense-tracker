import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRestorePreview, isPartialBackup, matchBackupExpenses, parseBackupText, restoreModePlan, restorePayloadHash, type ReceiptTrackerBackup } from "@/lib/backup-restore";
import { buildFullBackup, csvCell, buildItemsCsv, textChunks } from "@/lib/export";
import { filtersToSearchParams, parseExportQuery, rangeBounds } from "@/lib/export-query";
import { fingerprintFromPayload, fingerprintFromStored, sameFingerprint } from "@/lib/idempotency";
import { calculateItemAnalytics, calculateItemAnalyticsByCurrency, type ItemPurchase } from "@/lib/item-analytics";
import { isRealIsoDate } from "@/lib/local-date";
import { hasAtMostTwoDecimals, parseDecimalInput } from "@/lib/money";
import { backfillPreview, initialNextRunDate, recurringExpenseSchema } from "@/lib/recurring-expenses";
import { chunk, fetchAllByIdChunks, fetchAllPages, IncompleteDataError, type PageResponse } from "@/lib/supabase/fetch-all";
import type { ExpenseWithDetails } from "@/types/expense";

// All fixtures are synthetic.
const OWNER = "00000000-0000-4000-8000-0000000000aa";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function fakeTable(total: number, serverMaxRows: number, options: { countOverride?: number; duplicateAt?: number } = {}) {
  const rows = Array.from({ length: total }, (_, index) => ({ id: uuid(index) }));
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number, withCount: boolean): Promise<PageResponse<{ id: string }>> => {
    calls.push([from, to]);
    let page = rows.slice(from, Math.min(to + 1, from + serverMaxRows));
    if (options.duplicateAt !== undefined && from > 0) page = [rows[options.duplicateAt], ...page.slice(1)];
    return { data: page, error: null, count: withCount ? options.countOverride ?? total : null };
  };
  return { fetchPage, calls };
}

describe("verified pagination (C2)", () => {
  it("reads more than 1000 rows even when the server caps each response", async () => {
    const table = fakeTable(2345, 1000);
    const rows = await fetchAllPages("測試", table.fetchPage, { pageSize: 500, getId: (row) => row.id });
    expect(rows).toHaveLength(2345);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2345);
  });
  it("still completes when max_rows is smaller than the requested page", async () => {
    const rows = await fetchAllPages("測試", fakeTable(1200, 300).fetchPage, { pageSize: 500 });
    expect(rows).toHaveLength(1200);
  });
  it("fails closed when fewer rows arrive than the exact count", async () => {
    await expect(fetchAllPages("消費資料", fakeTable(10, 1000, { countOverride: 11 }).fetchPage)).rejects.toBeInstanceOf(IncompleteDataError);
  });
  it("detects rows that shifted between pages", async () => {
    await expect(fetchAllPages("消費資料", fakeTable(1200, 500, { duplicateAt: 0 }).fetchPage, { pageSize: 500, getId: (row) => row.id })).rejects.toThrow("讀取期間資料有變動");
  });
  it("propagates query errors instead of returning partial data", async () => {
    await expect(fetchAllPages("消費資料", async () => ({ data: null, error: { message: "boom", code: "42501" }, count: null }))).rejects.toThrow("無法讀取消費資料：沒有權限");
  });
  it("splits .in() filters into chunks of at most 100 IDs", async () => {
    const ids = Array.from({ length: 250 }, (_, index) => uuid(index));
    const sizes: number[] = [];
    const rows = await fetchAllByIdChunks(ids, async (part) => { sizes.push(part.length); return part; });
    expect(sizes).toEqual([100, 100, 50]);
    expect(rows).toHaveLength(250);
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
  it("routes every multi-row ledger read through the verified helper", () => {
    for (const file of ["src/lib/expenses.ts", "src/lib/items.ts", "src/lib/recurring-expense-data.ts", "src/lib/export-data.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(/fetchAllPages|getExpenses\(|fetchAllProductAliases|fetchAllRecurringExpenses/);
    }
    expect(readFileSync("src/lib/expenses.ts", "utf8")).toContain("fetchAllByIdChunks");
  });
});

const purchase = (id: string, currency: string, amount: number): ItemPurchase => ({ id, expense_id: "e", name_original: "Milch", name_normalized: "牛奶", quantity: 1, amount, category: "食品雜貨", confidence: null, brand: "N/A", created_at: "", updated_at: "", merchant: "REWE", expense_date: "2026-09-01", currency });

describe("multi-currency product analytics (C3)", () => {
  it("never adds EUR, TWD and USD together", () => {
    const result = calculateItemAnalyticsByCurrency([purchase("1", "EUR", 1.5), purchase("2", "TWD", 85), purchase("3", "EUR", 2), purchase("4", "USD", 3)]);
    expect(result.map((value) => [value.currency, value.analytics.totalCents])).toEqual([["EUR", 350], ["TWD", 8500], ["USD", 300]]);
  });
  it("refuses to compute a single total across currencies", () => {
    expect(() => calculateItemAnalytics([purchase("1", "EUR", 1), purchase("2", "TWD", 30)])).toThrow("幣別");
  });
});

const backupExpense = (n: number, overrides: Record<string, unknown> = {}) => ({ id: uuid(n), merchant: "Café X", expense_date: "2026-09-01", amount: 2.5, currency: "EUR", category: "餐飲", source: "manual", items: [], adjustments: [], ...overrides });
const backupOf = (expenses: unknown[], extra: Record<string, unknown> = {}) => parseBackupText(JSON.stringify({ export_version: "1.1", generated_at: "2026-10-08T10:00:00Z", date_range: { start: null, end: null }, scope: { is_partial: false, filters: {} }, expenses, recurring_expenses: [], ...extra })).data as ReceiptTrackerBackup;
const stored = (n: number, overrides: Partial<ExpenseWithDetails> = {}): ExpenseWithDetails => ({ id: uuid(n), user_id: OWNER, merchant: "Café X", expense_date: "2026-09-01", amount: 2.5, currency: "EUR", category: "餐飲", payment_method: null, receipt_image_url: null, receipt_image_path: null, raw_receipt_text: null, ai_confidence: null, notes: null, source: "manual", import_warnings: [], import_idempotency_key: null, created_at: `2026-09-01T10:00:0${n % 10}Z`, updated_at: "2026-09-01T10:00:00Z", expense_items: [], expense_adjustments: [], ...overrides });

describe("restore duplicate detection (D1)", () => {
  it("keeps two genuine €2.50 coffees from the same day as two expenses", () => {
    const preview = buildRestorePreview(backupOf([backupExpense(1), backupExpense(2)]), [], []);
    expect(preview.unique_records).toBe(2);
    expect(restoreModePlan(preview, "skip").add).toBe(2);
    expect(preview.same_signature_in_backup).toBe(2);
  });
  it("lets one existing coffee absorb only one backup coffee", () => {
    const preview = buildRestorePreview(backupOf([backupExpense(1), backupExpense(2)]), [stored(9)], []);
    expect(preview.exact_duplicates + preview.probable_duplicates).toBe(1);
    expect(preview.unique_records).toBe(1);
  });
  it("prefers an id match over a signature match for the same existing row", () => {
    const matches = matchBackupExpenses(backupOf([backupExpense(2), backupExpense(1)]).expenses, [stored(1)]);
    expect(matches.map((value) => value.match)).toEqual([null, "id"]);
  });
  it("matches a generated recurring expense by rule and period", () => {
    const rule = uuid(500);
    const matches = matchBackupExpenses(backupOf([backupExpense(3, { merchant: "Landlord", amount: 700, source: "recurring", recurring_expense_id: rule, recurring_period: "2026-09-01" })]).expenses, [stored(8, { merchant: "Landlord", amount: 700, source: "recurring", recurring_expense_id: rule, recurring_period: "2026-09-01" })]);
    expect(matches[0].match).toBe("recurring_link");
  });
  it("rejects a backup that repeats an expense id", () => {
    expect(parseBackupText(JSON.stringify({ export_version: "1.1", generated_at: "2026-10-08T10:00:00Z", date_range: { start: null, end: null }, expenses: [backupExpense(1), backupExpense(1)] })).errors.join()).toContain("重複");
  });
});

describe("atomic restore contract (C1, D2)", () => {
  const sql = readFileSync("supabase/migrations/20261008000100_atomic_restore_v2.sql", "utf8");
  const action = readFileSync("src/app/import/backup/actions.ts", "utf8");
  it("restores ledger, aliases, rules and links in one function", () => {
    for (const fragment of ["insert into public.recurring_expenses", "insert into public.expenses", "insert into public.expense_items", "insert into public.product_aliases", "recurring_expense_id, recurring_period"]) expect(sql).toContain(fragment);
  });
  it("binds a restore key to the payload hash and mode", () => {
    expect(sql).toContain("raise exception 'restore_key_conflict'");
    expect(sql).toContain("payload_hash");
  });
  it("is owner-gated, uses an empty search_path and is not executable by anon", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("public.is_authorized_user()");
    expect(sql).toMatch(/revoke all on function public\.restore_receipt_tracker_backup_v2\([^)]*\) from public, anon/);
  });
  it("refuses Replace all for a partial backup and never backfills historical months", () => {
    expect(sql).toContain("partial_backup_replace_forbidden");
    expect(sql).toContain("date_trunc('month', p_today)");
  });
  it("calls only the atomic RPC from the app", () => {
    expect(action).toContain("restore_receipt_tracker_backup_v2");
    expect(action).not.toMatch(/rpc\("restore_recurring_expenses"/);
    expect(action).not.toMatch(/rpc\("restore_receipt_tracker_backup"/);
  });
  it("creates a new restore key for each new operation in the form", () => {
    const form = readFileSync("src/components/backup-restore-form.tsx", "utf8");
    expect(form).toContain("current.signature === signature && !current.completed");
    expect(form).toContain("operation.current = null");
  });
  it("hashes payload and mode deterministically", async () => {
    const backup = backupOf([backupExpense(1)]);
    expect(await restorePayloadHash(backup, "skip")).toBe(await restorePayloadHash(backup, "skip"));
    expect(await restorePayloadHash(backup, "skip")).not.toBe(await restorePayloadHash(backup, "merge"));
    expect(await restorePayloadHash(backup, "skip")).not.toBe(await restorePayloadHash(backupOf([backupExpense(2)]), "skip"));
  });
});

describe("partial backups (D4)", () => {
  const dataset = { expenses: [stored(1)], aliases: [], recurringExpenses: [] };
  it("marks a filtered Full Backup as partial with its filters", () => {
    const backup = buildFullBackup(dataset, { merchant: "REWE" });
    expect(backup.scope).toMatchObject({ is_partial: true, filters: { merchant: "REWE" }, timezone: "Europe/Berlin" });
    expect(backup.generated_at).toBeTruthy();
  });
  it("marks an unfiltered Full Backup as complete and round-trips it", () => {
    const parsed = parseBackupText(JSON.stringify(buildFullBackup(dataset, {}))).data as ReceiptTrackerBackup;
    expect(isPartialBackup(parsed)).toBe(false);
  });
  it("blocks Replace all for partial backups, including legacy files with a date range", () => {
    const legacy = parseBackupText(JSON.stringify({ export_version: "1.0", generated_at: "2026-07-26T12:00:00Z", date_range: { start: "2026-07-01", end: null }, expenses: [] })).data as ReceiptTrackerBackup;
    expect(isPartialBackup(legacy)).toBe(true);
    expect(restoreModePlan(buildRestorePreview(legacy, [], []), "replace").blocked).toBe(true);
  });
});

describe("export range and Berlin dates (D5, D6)", () => {
  it("applies typed dates even when a preset range was selected", () => {
    expect(parseExportQuery({ range: "all", start: "2026-02-01", end: "2026-02-28" })).toMatchObject({ range: "custom", filters: { start: "2026-02-01", end: "2026-02-28" }, error: null });
  });
  it("reports invalid or reversed dates instead of guessing", () => {
    expect(parseExportQuery({ range: "custom", start: "2026-02-30" }).error).toContain("開始日期無效");
    expect(parseExportQuery({ range: "custom", start: "2026-03-02", end: "2026-03-01" }).error).toContain("晚於");
  });
  it("uses the Berlin calendar day just after midnight on the first of the month", () => {
    // 2026-10-31T23:30Z is 2026-11-01 00:30 in Berlin (CET).
    expect(rangeBounds("month", new Date("2026-10-31T23:30:00Z"))).toEqual({ start: "2026-11-01", end: "2026-11-01" });
    // Summer time: 2026-06-30T22:30Z is 2026-07-01 00:30 CEST.
    expect(rangeBounds("3m", new Date("2026-06-30T22:30:00Z"))).toEqual({ start: "2026-05-01", end: "2026-07-01" });
  });
  it("keeps only the preset name in download links so the server recomputes it", () => {
    expect(filtersToSearchParams("month", { start: "2026-10-01", end: "2026-10-08", merchant: "dm" }).toString()).toBe("range=month&merchant=dm");
    expect(filtersToSearchParams("custom", { start: "2026-10-01" }).toString()).toBe("range=custom&start=2026-10-01");
  });
  it("validates real calendar dates", () => { expect(isRealIsoDate("2028-02-29")).toBe(true); expect(isRealIsoDate("2026-02-29")).toBe(false); });
});

describe("CSV formula injection (S1)", () => {
  it("neutralizes text that a spreadsheet would execute", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("+49 170 1234")).toBe("'+49 170 1234");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
  });
  it("keeps negative and positive amounts as numbers", () => {
    expect(csvCell("-1.00")).toBe("-1.00");
    expect(csvCell(-2.5)).toBe("-2.5");
    expect(csvCell("12.30")).toBe("12.30");
  });
  it("protects item names in the item CSV", () => {
    const value = buildItemsCsv({ expenses: [stored(1, { expense_items: [{ id: "i", expense_id: uuid(1), name_original: "=1+1", name_normalized: "x", quantity: 1, amount: 1, category: "餐飲", confidence: null, brand: "N/A", created_at: "", updated_at: "" }] })], aliases: [] });
    expect(value).toContain(",'=1+1,");
  });
});

describe("streamed export chunks", () => {
  it("never splits a surrogate pair and reassembles exactly", () => {
    const text = "a".repeat(9) + "😀" + "b".repeat(5);
    const parts = textChunks(text, 10);
    expect(parts.join("")).toBe(text);
    for (const part of parts) expect(part).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});

describe("recurring backfill (D3)", () => {
  it("starts a new rule with a past start date from today by default", () => {
    expect(initialNextRunDate(1, "2026-01-01", "2026-10-08", false)).toBe("2026-11-01");
    expect(initialNextRunDate(15, "2026-01-01", "2026-10-08", false)).toBe("2026-10-15");
  });
  it("starts from the start date only with an explicit backfill", () => {
    expect(initialNextRunDate(1, "2026-01-01", "2026-10-08", true)).toBe("2026-01-01");
  });
  it("previews the exact months a backfill would create", () => {
    expect(backfillPreview(31, "2026-01-15", "2026-04-10")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(backfillPreview(1, "2026-10-09", "2026-10-08")).toEqual([]);
    expect(backfillPreview(1, "2026-01-01", "2026-12-01", "2026-03-31")).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
  it("defaults backfill to off and accepts a German decimal comma", () => {
    const parsed = recurringExpenseSchema.parse({ merchant: "Miete", amount: "700,50", currency: "eur", category: "房租", day_of_month: "1", start_date: "2026-01-01", end_date: "", is_active: "on" });
    expect(parsed).toMatchObject({ amount: 700.5, backfill: false, currency: "EUR" });
  });
  it("never sends next_run_date from the start date without confirmation", () => {
    const action = readFileSync("src/app/recurring/actions.ts", "utf8");
    expect(action).toContain('formData.get("backfill_confirm") === "on"');
    expect(action).toContain("initialNextRunDate(");
  });
});

describe("idempotency payload comparison (D8)", () => {
  const payload = { merchant: " dm ", expense_date: "2026-09-01", currency: "eur", total_amount: 9, items: [{ amount: 10 }], adjustments: [{ amount: -1 }] };
  it("accepts the stored record of the same submission", () => {
    expect(sameFingerprint(fingerprintFromPayload(payload), fingerprintFromStored(stored(1, { merchant: "dm", amount: 9, expense_items: [{ id: "i", expense_id: uuid(1), name_original: "x", name_normalized: "x", quantity: 1, amount: 10, category: "日用品", confidence: null, brand: "N/A", created_at: "", updated_at: "" }], expense_adjustments: [{ id: "a", expense_id: uuid(1), name: "Rabatt", amount: -1, category: "其他", created_at: "", updated_at: "" }] })))).toBe(true);
  });
  it("detects a different payload behind the same key", () => {
    expect(sameFingerprint(fingerprintFromPayload({ ...payload, total_amount: 9.5 }), fingerprintFromPayload(payload))).toBe(false);
  });
});

describe("amount input parsing", () => {
  it("accepts dot and comma decimals and rejects ambiguous text", () => {
    expect(parseDecimalInput("12,50")).toBe(12.5);
    expect(parseDecimalInput("-1.20")).toBe(-1.2);
    expect(parseDecimalInput("−0,40")).toBe(-0.4);
    expect(parseDecimalInput("1.234,56")).toBeNull();
    expect(parseDecimalInput("12.345")).toBeNull();
    expect(parseDecimalInput("")).toBeNull();
  });
  it("detects more than two decimals", () => { expect(hasAtMostTwoDecimals(0.1 + 0.2)).toBe(true); expect(hasAtMostTwoDecimals(1.005)).toBe(false); });
});
