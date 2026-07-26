import Link from "next/link";
import { Notice } from "@/components/notice";
import { getExpenses, isValidMonth } from "@/lib/expenses";
import { formatExpenseAmount } from "@/lib/money";
import { EXPENSE_CATEGORIES } from "@/types/expense";

export const dynamic = "force-dynamic";
function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const monthValue = single(params.month);
  const month = isValidMonth(monthValue) ? monthValue : undefined;
  const category = single(params.category);
  const query = single(params.query)?.trim();
  const result = await getExpenses({ month, category, query });
  const expenses = result.data ?? [];
  return (
    <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Notice error={single(params.error)} success={single(params.success)} warning={single(params.warning)} />
      <div className="flex items-end justify-between gap-4"><div><h1 className="text-3xl font-bold text-slate-950">消費紀錄</h1><p className="mt-1 text-slate-600">搜尋、篩選與管理所有消費。</p></div><Link className="min-h-11 shrink-0 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white" href="/expenses/new">新增</Link></div>
      <form className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4" method="get">
        <label className="text-sm font-medium text-slate-700">月份<input className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" defaultValue={month} name="month" type="month" /></label>
        <label className="text-sm font-medium text-slate-700">類別<select className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" defaultValue={category ?? ""} name="category"><option value="">全部類別</option>{EXPENSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="form-label sm:col-span-2">搜尋店家<div className="mt-2 flex gap-2"><input className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3" defaultValue={query} name="query" placeholder="例如 REWE" /><button className="rounded-xl bg-slate-900 px-4 font-semibold text-white" type="submit">搜尋</button></div></label>
      </form>
      {result.error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{result.error}</p> : expenses.length === 0 ? <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-600">找不到符合條件的消費。</div> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">{expenses.map((expense) => (
          <li key={expense.id}><Link className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50 sm:p-5" href={`/expenses/${expense.id}`}><div className="min-w-0"><p className="truncate font-semibold text-slate-950">{expense.merchant}{(expense.receipt_image_path || expense.receipt_image_url) && <span aria-label="有收據附件" className="ml-2 text-sm" title="有收據附件">📎</span>}</p><p className="mt-1 text-sm text-slate-500">{expense.expense_date} · {expense.category}{expense.payment_method ? ` · ${expense.payment_method}` : ""}</p></div><p className="shrink-0 font-bold">{formatExpenseAmount(expense.amount, expense.currency)}</p></Link></li>
        ))}</ul>
      )}
    </div></main>
  );
}
