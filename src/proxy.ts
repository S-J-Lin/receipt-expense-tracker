import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOwnerClaim, proxyDecision } from "@/lib/proxy-policy";

type CookieToSet = { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] };

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return new NextResponse("Service unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });

  // Session refreshes write cookies with options (path, maxAge, sameSite,
  // secure, httpOnly). They are replayed with their options on every response,
  // including redirects, so a refreshed or cleared session is never downgraded.
  const pendingCookies: CookieToSet[] = [];
  const pendingHeaders: Record<string, string> = {};
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (values, headers) => {
      values.forEach(({ name, value }) => request.cookies.set(name, value));
      pendingCookies.splice(0, pendingCookies.length, ...values);
      Object.assign(pendingHeaders, headers ?? {});
      response = NextResponse.next({ request });
      apply(response, pendingCookies, pendingHeaders);
    },
  } });
  const { data } = await supabase.auth.getClaims();
  const authorized = isOwnerClaim(data?.claims?.sub, process.env.AUTHORIZED_USER_ID);
  const decision = proxyDecision(request.nextUrl.pathname, authorized);
  if (decision === "redirect-home" || decision === "redirect-login") {
    const redirect = NextResponse.redirect(new URL(decision === "redirect-home" ? "/" : "/login", request.url));
    apply(redirect, pendingCookies, pendingHeaders);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  if (decision === "next") response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function apply(target: NextResponse, cookies: CookieToSet[], headers: Record<string, string>) {
  cookies.forEach(({ name, value, options }) => target.cookies.set(name, value, options));
  for (const [name, value] of Object.entries(headers)) target.headers.set(name, value);
}

export const config = { matcher: ["/((?!api/cron/recurring-expenses|_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"] };
