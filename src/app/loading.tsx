export default function Loading() {
  return <main aria-busy="true" aria-label="載入中" className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6 sm:px-6">
    <div className="space-y-4 motion-safe:animate-pulse" aria-hidden="true">
      <section className="h-40 rounded-2xl bg-[var(--card)]" />
      <section className="h-56 rounded-2xl bg-[var(--card)]" />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="h-24 rounded-2xl bg-[var(--card)]" key={index} />)}</section>
    </div>
    <p className="text-center text-sm ui-muted" role="status">資料載入中…完成後會顯示實際資料，不會先顯示 0。</p>
  </main>;
}
