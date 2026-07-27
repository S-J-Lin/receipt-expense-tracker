import Link from "next/link";
import { ManualExpenseForm } from "@/components/manual-expense-form";
import { UiIcon } from "@/components/ui-icon";

export default async function NewExpensePage() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  return (
    <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-2xl space-y-5">
      <Link className="text-sm font-semibold text-indigo-600" href="/">← 返回首頁</Link>
      <section className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white"><UiIcon className="h-6 w-6" name="plus" /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-indigo-700">每月自動記帳</p><h2 className="mt-1 text-xl font-bold text-slate-950">新增固定支出</h2><p className="mt-2 text-sm leading-6 text-slate-600">房租、保險、訂閱或月票等固定扣款，只需設定一次。</p></div>
        </div>
        <Link className="mt-5 flex min-h-12 w-full items-center justify-center rounded-2xl bg-indigo-600 px-5 font-semibold text-white hover:bg-indigo-700" href="/recurring/new">建立每月固定支出 →</Link>
      </section>
      <div className="flex items-center gap-3 text-sm font-semibold text-slate-500"><span className="h-px flex-1 bg-slate-200" /><span>或手動新增單筆消費</span><span className="h-px flex-1 bg-slate-200" /></div>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-950">新增消費</h1><p className="mt-2 text-slate-600">快速輸入整筆消費；需要時可展開商品明細與 adjustment。</p>
        <div className="mt-6"><ManualExpenseForm today={today} /></div>
      </section>
    </div></main>
  );
}
