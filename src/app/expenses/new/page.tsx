import Link from "next/link";
import { createExpenseAction } from "@/app/actions";
import { ExpenseForm } from "@/components/expense-form";

export default function NewExpensePage() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  return (
    <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-2xl">
      <Link className="text-sm font-semibold text-indigo-600" href="/">← 返回首頁</Link>
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-950">新增消費</h1><p className="mt-2 text-slate-600">先手動輸入資料；收據辨識會在後續 milestone 加入。</p>
        <div className="mt-6"><ExpenseForm action={createExpenseAction} submitLabel="儲存消費" today={today} /></div>
      </section>
    </div></main>
  );
}
