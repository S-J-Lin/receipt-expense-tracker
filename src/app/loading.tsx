export default function Loading() {
  return <main aria-busy="true" aria-label="載入中" className="mx-auto w-full max-w-5xl flex-1 animate-pulse px-4 py-8"><div className="h-8 w-44 rounded bg-slate-200"/><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="h-36 rounded-3xl bg-slate-200"/><div className="h-36 rounded-3xl bg-slate-200"/></div><p className="mt-5 text-sm text-slate-500">資料載入中…</p></main>;
}
