import type { Metadata } from "next";
import Link from "next/link";
import { ManualExpenseForm } from "@/components/manual-expense-form";
import { UiIcon } from "@/components/ui-icon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "新增消費" };

export default function NewExpensePage() {
  return (
    <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-2xl space-y-4">
      <section aria-labelledby="new-expense-title" className="ui-card">
        <h1 className="text-2xl font-bold" id="new-expense-title">新增消費</h1><p className="mt-1 text-sm ui-muted">快速輸入整筆消費；需要時可展開商品明細與調整項。</p>
        <div className="mt-5"><ManualExpenseForm /></div>
      </section>
      <Link className="ui-card ui-compact flex min-h-16 items-center gap-3 hover:bg-slate-100" href="/recurring/new">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><UiIcon className="h-5 w-5" name="plus" /></span>
        <span className="min-w-0 flex-1"><span className="block font-semibold">新增每月固定支出</span><span className="block text-sm ui-muted">房租、保險、訂閱或月票，只需設定一次</span></span>
        <span aria-hidden="true" className="shrink-0 ui-muted">›</span>
      </Link>
    </div></main>
  );
}
