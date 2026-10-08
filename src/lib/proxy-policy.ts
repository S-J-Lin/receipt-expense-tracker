// Pure routing policy for src/proxy.ts (kept separate so it can be unit tested).
// The proxy is only the first gate: every page, Server Action and Route
// Handler re-checks the owner with requireAuthorizedUser()/getAuthorization().

export type ProxyDecision = "next" | "redirect-login" | "redirect-home" | "route-handler-auth";

export function isOwnerClaim(sub: unknown, allowed: string | undefined): boolean {
  return typeof sub === "string" && Boolean(allowed) && sub === allowed;
}

export function proxyDecision(pathname: string, authorized: boolean): ProxyDecision {
  if (pathname === "/login") return authorized ? "redirect-home" : "next";
  // Download handlers answer 401/403 themselves instead of an HTML redirect.
  if (pathname.startsWith("/export/download/")) return "route-handler-auth";
  return authorized ? "next" : "redirect-login";
}
