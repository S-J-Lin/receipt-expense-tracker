import Link from "next/link";

export function AppHeader() {
  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link
          aria-label="返回 Receipt Tracker Dashboard"
          className="rounded-lg text-lg font-bold text-slate-950 outline-none transition-colors hover:text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          href="/"
        >
          Receipt Tracker
        </Link>
        <nav className="flex items-center gap-1 text-sm font-semibold">
          <Link className="rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-100" href="/expenses">消費紀錄</Link>
          <Link className="rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-100" href="/items">商品</Link>
          <Link className="rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-100" href="/export">匯出</Link>
          <Link className="hidden rounded-xl px-3 py-2 text-indigo-700 hover:bg-indigo-50 sm:block" href="/import/chatgpt">匯入 ChatGPT</Link>
          <Link className="rounded-xl bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700" href="/expenses/new">新增</Link>
        </nav>
      </div>
    </header>
  );
}
