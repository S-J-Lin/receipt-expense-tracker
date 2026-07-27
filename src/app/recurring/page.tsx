import Link from "next/link";
import { Notice } from "@/components/notice";
import { getRecurringExpenses } from "@/lib/recurring-expense-data";
import { formatExpenseAmount } from "@/lib/money";

export const dynamic = "force-dynamic";
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function RecurringPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const result = await getRecurringExpenses();
  const groups = [
    { title: "啟用中", rules: result.data.filter((r) => r.is_active && !r.cancelled_at && (!r.end_date || r.next_run_date <= r.end_date)) },
    { title: "已暫停", rules: result.data.filter((r) => !r.is_active && !r.cancelled_at && (!r.end_date || r.next_run_date <= r.end_date)) },
    { title: "已結束／取消", rules: result.data.filter((r) => Boolean(r.cancelled_at) || Boolean(r.end_date && r.next_run_date > r.end_date)) },
  ];
  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-5xl space-y-6">
    <Notice error={one(params.error)} success={one(params.success)} />
    <div className="flex items-end justify-between gap-4"><div><Link className="text-sm font-semibold text-indigo-600" href="/expenses">← 更多</Link><h1 className="mt-3 text-3xl font-bold">固定支出</h1><p className="mt-2 text-slate-600">每月自動建立正式消費；29–31 日遇到短月時使用月底。</p></div><Link className="min-h-11 shrink-0 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white" href="/recurring/new">新增</Link></div>
    {result.error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{result.error}</p>}
    {groups.map((group) => <section className="rounded-3xl border border-slate-200 bg-white p-5" key={group.title}><h2 className="text-xl font-bold">{group.title} <span className="text-sm font-normal text-slate-500">{group.rules.length}</span></h2>
      {group.rules.length === 0 ? <p className="mt-4 text-sm text-slate-500">沒有資料。</p> : <ul className="mt-3 divide-y divide-slate-100">{group.rules.map((rule) => <li key={rule.id}><Link className="flex items-center justify-between gap-4 py-4" href={`/recurring/${rule.id}`}><div className="min-w-0"><p className="truncate font-semibold">{rule.merchant}</p><p className="mt-1 text-sm text-slate-500">每月 {rule.day_of_month} 日 · {rule.category} · 下次 {rule.next_run_date}</p></div><p className="shrink-0 font-bold">{formatExpenseAmount(rule.amount, rule.currency)}</p></Link></li>)}</ul>}
    </section>)}
  </div></main>;
}

