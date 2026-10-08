import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isMissingFunction, toUserMessage } from "@/lib/errors";
import { isOwnerClaim, proxyDecision } from "@/lib/proxy-policy";

const OWNER = "00000000-0000-4000-8000-0000000000aa";

describe("proxy routing policy", () => {
  it("redirects unauthenticated and non-owner sessions to login", () => {
    expect(proxyDecision("/", isOwnerClaim(undefined, OWNER))).toBe("redirect-login");
    expect(proxyDecision("/expenses", isOwnerClaim("00000000-0000-4000-8000-0000000000bb", OWNER))).toBe("redirect-login");
  });
  it("fails closed when AUTHORIZED_USER_ID is not configured", () => expect(isOwnerClaim(OWNER, undefined)).toBe(false));
  it("lets the owner through and away from the login page", () => {
    expect(proxyDecision("/import/backup", isOwnerClaim(OWNER, OWNER))).toBe("next");
    expect(proxyDecision("/login", true)).toBe("redirect-home");
  });
  it("leaves download routes to their own 401/403 handling", () => expect(proxyDecision("/export/download/full-json", false)).toBe("route-handler-auth"));
  it("replays refreshed cookies with their options on redirects", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toContain("target.cookies.set(name, value, options)");
    expect(proxy).toContain("apply(redirect, pendingCookies, pendingHeaders)");
  });
});

describe("protected server entry points", () => {
  it("re-checks the owner in every Server Action file and the export route", () => {
    for (const file of ["src/app/actions.ts", "src/app/expenses/new/actions.ts", "src/app/expenses/[id]/edit/item-actions.ts", "src/app/import/chatgpt/actions.ts", "src/app/import/backup/actions.ts", "src/app/recurring/actions.ts", "src/app/receipts/upload/actions.ts", "src/app/receipts/confirm/[sessionId]/actions.ts"]) {
      expect(readFileSync(file, "utf8"), file).toContain("requireAuthorizedUser()");
    }
    expect(readFileSync("src/app/export/download/[format]/route.ts", "utf8")).toContain("getAuthorization()");
  });
  it("keeps the secret key server-only and out of the browser client", () => {
    expect(readFileSync("src/lib/supabase/cron.ts", "utf8")).toContain('import "server-only"');
    expect(readFileSync("src/lib/supabase/client.ts", "utf8")).not.toContain("SUPABASE_SECRET_KEY");
    expect(readFileSync("src/lib/supabase/server.ts", "utf8")).not.toContain("SUPABASE_SECRET_KEY");
  });
  it("protects the cron route with a bearer secret", () => {
    const route = readFileSync("src/app/api/cron/recurring-expenses/route.ts", "utf8");
    expect(route).toContain("Bearer ${secret}");
    expect(route).not.toContain("detail: error.message");
  });
  it("does not delete receipts that are still referenced", () => {
    const storage = readFileSync("src/lib/receipt-storage.ts", "utf8");
    expect(storage).toContain('eq("receipt_image_path", path)');
    expect(readFileSync("src/app/receipts/upload/actions.ts", "utf8")).not.toMatch(/await removeReceipt\(/);
  });
  it("keeps forward migrations free of real user UUIDs", () => {
    const sql = readFileSync("supabase/migrations/20261008000100_atomic_restore_v2.sql", "utf8");
    expect(sql.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []).toEqual([]);
  });
});

describe("security headers", () => {
  const config = readFileSync("next.config.ts", "utf8");
  it("denies framing, sniffing and cross-site referrers", () => {
    for (const value of ["frame-ancestors 'none'", "X-Frame-Options", "nosniff", "Referrer-Policy", "Permissions-Policy"]) expect(config).toContain(value);
  });
  it("never caches the service worker script", () => expect(config).toContain("no-cache, no-store, must-revalidate"));
});

describe("database error messages", () => {
  it("maps known errors without echoing raw database text", () => {
    expect(toUserMessage({ code: "23514", message: "new row violates check constraint \"expenses_amount_check\"" })).not.toContain("expenses_amount_check");
    expect(toUserMessage({ message: "restore_key_conflict" })).toContain("還原識別碼");
    expect(toUserMessage({ code: "XX000", message: "secret detail" })).not.toContain("secret detail");
  });
  it("detects a missing RPC (migration not yet applied)", () => {
    expect(isMissingFunction({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
    expect(isMissingFunction({ code: "23505", message: "dup" })).toBe(false);
  });
});
