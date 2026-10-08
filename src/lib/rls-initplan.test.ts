import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261009000100_rls_initplan.sql", "utf8");
const original = readFileSync("supabase/migrations/20260926000100_single_user_private_lockdown.sql", "utf8");
const policies = (sql: string) => [...sql.matchAll(/create policy "owner [^"]+"[^;]+;/g)].map(([policy]) => policy.replace(/\s+/g, " ").trim());

describe("RLS initplan forward migration", () => {
  it("changes only scalar function wrapping across exactly nine equivalent policies", () => {
    const unwrapped = migration.replaceAll("(select auth.uid())", "auth.uid()").replaceAll("(select public.is_authorized_user())", "public.is_authorized_user()");
    expect(policies(migration)).toHaveLength(9); expect(policies(unwrapped)).toEqual(policies(original));
  });
  it("uses a transaction, exact known policy drops and fails closed for unexpected policies", () => {
    expect(migration).toContain("begin;"); expect(migration.trim().endsWith("commit;")).toBe(true);
    expect([...migration.matchAll(/drop policy "owner [^"]+" on/g)]).toHaveLength(9);
    expect(migration).toContain("Unexpected RLS policy name, roles, command or permissiveness");
    expect(migration).toContain("Expected exactly nine owner policies");
    expect(migration).not.toMatch(/execute|drop table|truncate|delete from|update public|grant |revoke /i);
    expect(migration).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
  it("wraps every auth helper call in policy expressions", () => {
    for (const policy of policies(migration)) {
      const stripped = policy.replaceAll("(select auth.uid())", "UID").replaceAll("(select public.is_authorized_user())", "OWNER");
      expect(stripped).not.toContain("auth.uid()"); expect(stripped).not.toContain("public.is_authorized_user()");
    }
  });
});
