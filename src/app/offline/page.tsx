import Link from "next/link";

export default function OfflinePage() {
  return <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16"><section className="w-full rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm"><p className="text-5xl" aria-hidden>⌁</p><h1 className="mt-4 text-2xl font-bold">目前沒有網路連線</h1><p className="mt-3 text-slate-600">Receipt Tracker 需要網路才能讀取或儲存 Supabase 資料。已填寫的表單請先保留此畫面，恢復網路後再送出。</p><Link className="mt-6 inline-flex min-h-12 items-center rounded-2xl bg-indigo-600 px-5 font-semibold text-white" href="/">重新嘗試</Link></section></main>;
}
