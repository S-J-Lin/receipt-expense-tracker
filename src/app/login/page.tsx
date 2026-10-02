import { loginAction } from "@/app/login/actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="flex min-h-[70svh] flex-1 items-center justify-center px-4 py-12"><section className="w-full max-w-sm rounded-2xl border border-[#2c2c2c] bg-[#1e1e1e] p-6 text-[#f5f5f5] sm:p-8">
    <h1 className="text-2xl font-semibold">Receipt Tracker</h1><p className="mt-2 text-sm text-[#a3a3a3]">登入你的私人帳本</p>
    <form action={loginAction} className="mt-7 space-y-5"><label className="block text-sm font-semibold text-[#a3a3a3]">Email<input autoComplete="username" className="mt-2 min-h-12 w-full rounded-xl border border-[#333] bg-[#161616] px-3 text-base text-[#f5f5f5] focus:border-[#4f8cff] focus:outline-none focus:ring-2 focus:ring-[#4f8cff]/25" name="email" required type="email" /></label>
      <label className="block text-sm font-semibold text-[#a3a3a3]">Password<input autoComplete="current-password" className="mt-2 min-h-12 w-full rounded-xl border border-[#333] bg-[#161616] px-3 text-base text-[#f5f5f5] focus:border-[#4f8cff] focus:outline-none focus:ring-2 focus:ring-[#4f8cff]/25" name="password" required type="password" /></label>
      {error && <p className="text-sm text-[#f87171]" role="alert">登入資訊錯誤。</p>}
      <button className="min-h-12 w-full rounded-xl bg-[#4f8cff] px-4 font-semibold text-[#08111f] hover:bg-[#76a5ff]" type="submit">登入</button>
    </form>
  </section></main>;
}
