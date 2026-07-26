import Link from "next/link";

export default function NotFound() {
  return <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16"><section className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><p className="text-sm font-bold text-indigo-700">404</p><h1 className="mt-2 text-2xl font-bold">找不到這個頁面</h1><p className="mt-3 text-slate-600">網址可能已變更，請回到 Dashboard 繼續。</p><Link className="mt-6 inline-flex min-h-12 items-center rounded-2xl bg-indigo-600 px-5 font-semibold text-white" href="/">返回 Dashboard</Link></section></main>;
}
