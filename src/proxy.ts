import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return new NextResponse("Service unavailable", { status: 503 });
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (values, headers) => {
      values.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      if (headers) for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    },
  } });
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const allowed = process.env.AUTHORIZED_USER_ID;
  const authorized = Boolean(allowed && claims?.sub === allowed);
  const path = request.nextUrl.pathname;
  if (path === "/login") {
    if (authorized) return redirectWithCookies(request, response, "/");
    return response;
  }
  if (path.startsWith("/export/download/")) return response;
  if (!authorized) return redirectWithCookies(request, response, "/login");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function redirectWithCookies(request: NextRequest, source: NextResponse, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url));
  source.cookies.getAll().forEach(({ name, value }) => response.cookies.set(name, value));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/((?!api/cron/recurring-expenses|_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"] };
