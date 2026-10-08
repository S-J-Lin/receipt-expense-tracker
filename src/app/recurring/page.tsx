import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/notice";
import { getRecurringExpenses } from "@/lib/recurring-expense-data";
import { formatExpenseAmount } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "固定支出" };
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function RecurringPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const result = await getRecurringExpenses();
  const ended = (r: (typeof result.data)[number]) => Boolean(r.cancelled_at) || Boolean(r.end_date && r.next_run_date > r.end_date);
  const groups = [
    { title: "啟用中", rules: result.data.filter((r) => r.is_active && !ended(r)) },
    { title: "已暫停", rules: result.data.filter((r) => !r.is_active && !ended(r)) },
    { title: "已結束／取消", rules: result.data.filter(ended) },
  ];
  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-5xl space-y-5">
    <Notice error={one(params.error)} success={one(params.success)} />
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-3"><div className="min-w-0"><Link className="ui-link text-sm" href="/settings">← 更多</Link><h1 className="text-2xl font-bold sm:text-3xl">固定支出</h1><p className="mt-1 ui-muted">每月自動建立正式消費；29–31 日遇到短月時使用月底。</p></div><Link className="ui-btn ui-btn-primary" href="/recurring/new">新增規則</Link></div>
    {result.error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{result.error}</p>}
    {!result.error && groups.map((group) => <section aria-label={group.title} className="ui-card" key={group.title}><h2 className="text-lg font-bold">{group.title} <span className="text-sm font-normal ui-muted">{group.rules.length}</span></h2>
      {group.rules.length === 0 ? <p className="mt-3 text-sm ui-muted">沒有資料。</p> : <ul className="mt-2 divide-y divide-[var(--border)]">{group.rules.map((rule) => <li key={rule.id}><Link className="flex min-h-14 items-center justify-between gap-4 py-3" href={`/recurring/${rule.id}`}><div className="min-w-0"><p className="line-clamp-2 break-words font-semibold">{rule.merchant}</p><p className="mt-1 text-sm ui-muted">每月 {rule.day_of_month} 日 · {rule.category} · 下次 {rule.next_run_date}</p></div><p className="money-value shrink-0 font-bold">{formatExpenseAmount(rule.amount, rule.currency)}</p></Link></li>)}</ul>}
    </section>)}
  </div></main>;
}
