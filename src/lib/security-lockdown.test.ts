import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createReceiptObjectPath, isValidReceiptPath } from "@/lib/receipt-validation";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260926000100_single_user_private_lockdown.sql");

describe("single-user security contract (static; live checks follow migration)", () => {
  it("fails closed until a real Auth UUID is supplied", () => {
    expect(migration).toContain("00000000-0000-0000-0000-000000000000");
    expect(migration).toContain("raise exception 'Replace the owner UUID placeholder");
    expect(migration).toContain("from auth.users");
    expect(migration).toContain("create schema if not exists receipt_tracker_private");
    expect(read("supabase/schema.sql")).toContain("Legacy schema.sql must not run after single-user lockdown");
  });
  it("backfills ownership and preserves existing row counts, sums and recurring links", () => {
    for (const table of ["expenses", "recurring_expenses", "product_aliases", "receipt_upload_sessions"]) expect(migration).toContain(`alter table public.${table} alter column user_id set not null`);
    expect(migration).toContain("Data reconciliation failed; transaction rolled back");
  });
  it("removes anonymous data access and scopes children to parent ownership", () => {
    expect(migration).toContain("from public, anon;");
    for (const table of ["expense_items", "expense_adjustments"]) expect(migration).toContain(`create policy "owner ${table === "expense_items" ? "expense items" : "expense adjustments"}"`);
    expect(migration).toContain("e.user_id = auth.uid()");
    expect(migration).toContain("public.is_authorized_user() and user_id = auth.uid()");
  });
  it("protects private receipts and legacy objects without deleting them", () => {
    expect(migration).toContain("update storage.buckets set public = false");
    expect(migration).toContain("drop policy if exists \"MVP anonymous receipt reads\"");
    expect(migration).toContain("(auth.uid()::text, 'anonymous')");
    expect(migration).not.toContain("delete from storage.objects");
    const owner = "00000000-0000-4000-8000-000000000001";
    expect(isValidReceiptPath(createReceiptObjectPath("jpg", owner))).toBe(true);
    expect(isValidReceiptPath("anonymous/2026/09/00000000-0000-4000-8000-000000000001-1234567890123.jpg")).toBe(true);
    expect(() => createReceiptObjectPath("jpg", "not-a-uuid")).toThrow();
  });
  it("removes anonymous RPC execution and checks definer wrappers", () => {
    for (const fn of ["restore_receipt_tracker_backup", "create_receipt_upload_session", "get_receipt_upload_session", "confirm_receipt_upload_session"]) expect(migration).toContain(`public.${fn}`);
    expect(migration).toContain("if not public.is_authorized_user() then raise exception 'forbidden'");
    expect(migration).toContain("revoke execute on function public.process_due_recurring_expenses(date,integer) from authenticated");
    expect(migration).toContain("to service_role");
  });
  it("checks export and every write-action entrypoint on the server", () => {
    expect(read("src/app/export/download/[format]/route.ts")).toContain("getAuthorization()");
    for (const path of ["src/app/actions.ts", "src/app/expenses/new/actions.ts", "src/app/expenses/[id]/edit/item-actions.ts", "src/app/import/chatgpt/actions.ts", "src/app/import/backup/actions.ts", "src/app/recurring/actions.ts", "src/app/receipts/upload/actions.ts", "src/app/receipts/confirm/[sessionId]/actions.ts"]) expect(read(path)).toContain("await requireAuthorizedUser()");
    expect(read("src/lib/supabase/cron.ts")).toContain("process.env.SUPABASE_SECRET_KEY");
    expect(read("src/lib/supabase/client.ts")).not.toContain("SUPABASE_SECRET_KEY");
  });
});
