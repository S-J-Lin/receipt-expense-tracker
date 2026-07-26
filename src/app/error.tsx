"use client";

import Link from "next/link";

export default function ErrorPage({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16"><section className="w-full rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-bold">暫時無法載入資料</h1><p className="mt-3 text-slate-600">請確認網路連線後重試。若問題持續，請稍後再開啟。</p><div className="mt-6 flex flex-col gap-3 sm:flex-row"><button className="min-h-12 flex-1 rounded-2xl bg-indigo-600 px-5 font-semibold text-white" onClick={() => unstable_retry()}>重試</button><Link className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-slate-300 font-semibold" href="/">返回 Dashboard</Link></div></section></main>;
}
