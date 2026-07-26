import Link from "next/link";
import { ManualExpenseForm } from "@/components/manual-expense-form";

export default async function NewExpensePage() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  return (
    <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-2xl">
      <Link className="text-sm font-semibold text-indigo-600" href="/">← 返回首頁</Link>
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-950">新增消費</h1><p className="mt-2 text-slate-600">快速輸入整筆消費；需要時可展開商品明細與 adjustment。</p>
        <div className="mt-6"><ManualExpenseForm today={today} /></div>
      </section>
    </div></main>
  );
}
