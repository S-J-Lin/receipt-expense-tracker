export default function Loading() {
  return <main aria-busy="true" aria-label="Dashboard 載入中" className="dashboard-page mx-auto w-full max-w-5xl flex-1 animate-pulse space-y-5 px-4 py-6 sm:px-6">
    <section className="h-48 rounded-2xl bg-slate-200 sm:h-56" />
    <section className="h-16 rounded-2xl bg-slate-200" />
    <section className="grid gap-4 lg:grid-cols-2"><div className="h-56 rounded-2xl bg-slate-200" /><div className="h-56 rounded-2xl bg-slate-200" /></section>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="h-32 rounded-2xl bg-slate-200" key={index} />)}</section>
    <section className="h-80 rounded-2xl bg-slate-200" />
    <span className="sr-only">資料載入中，完成後會顯示實際統計，不會先顯示零值。</span>
  </main>;
}
