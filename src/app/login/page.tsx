import type { Metadata } from "next";
import { loginAction } from "@/app/login/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "登入" };

const field = "mt-2 min-h-12 w-full rounded-xl border px-3 text-base";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="safe-top flex min-h-[80svh] flex-1 items-center justify-center px-4 py-12"><section aria-labelledby="login-title" className="ui-card w-full max-w-sm">
    <h1 className="text-2xl font-semibold" id="login-title">Receipt Tracker</h1><p className="mt-2 text-sm ui-muted">登入你的私人帳本</p>
    <form action={loginAction} className="mt-7 space-y-5">
      <div><label className="block text-sm font-semibold" htmlFor="login-email">Email</label><input aria-describedby={error ? "login-error" : undefined} aria-invalid={error ? true : undefined} autoCapitalize="none" autoComplete="username" autoCorrect="off" className={field} id="login-email" inputMode="email" name="email" required spellCheck={false} type="email" /></div>
      <div><label className="block text-sm font-semibold" htmlFor="login-password">Password</label><input aria-describedby={error ? "login-error" : undefined} aria-invalid={error ? true : undefined} autoComplete="current-password" className={field} id="login-password" name="password" required type="password" /></div>
      {error && <p className="text-sm text-[#f87171]" id="login-error" role="alert">登入資訊錯誤。</p>}
      <button className="ui-btn ui-btn-primary w-full" type="submit">登入</button>
    </form>
  </section></main>;
}
