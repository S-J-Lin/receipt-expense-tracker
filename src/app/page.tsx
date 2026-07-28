import Link from "next/link";
import { Notice } from "@/components/notice";
import { getCurrentMonth, getExpenses, isValidMonth } from "@/lib/expenses";
import { formatExpenseAmount, formatMoneyFromCents, moneyToCents } from "@/lib/money";
import { calculateDashboardStatistics } from "@/lib/dashboard-statistics";
import { getRecurringExpenses } from "@/lib/recurring-expense-data";

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requestedMonth = single(params.month);
  const month = isValidMonth(requestedMonth) ? requestedMonth : getCurrentMonth();
  const [result, recurringResult] = await Promise.all([getExpenses({ month }), getRecurringExpenses()]);
  const expenses = result.data ?? [];
  const activeRecurring = recurringResult.data.filter((rule) => rule.is_active && !rule.cancelled_at && (!rule.end_date || rule.next_run_date <= rule.end_date));

  const { totals, categoryTotals, dailyTotals } = calculateDashboardStatistics(expenses);
  const recurringSection = (
    <section className="rounded-3xl border border-indigo-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-indigo-700">自動記帳</p><h2 className="mt-1 text-xl font-bold">每月固定扣款</h2><p className="mt-2 text-sm text-slate-600">到期自動計入本月支出。</p></div><Link className="shrink-0 rounded-xl border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700" href="/recurring">查看全部</Link></div>
      {recurringResult.error ? <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">{recurringResult.error}</p> : activeRecurring.length === 0 ? <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-600">目前沒有啟用中的固定扣款。</p> : <ul className="mt-4 divide-y divide-slate-100">{activeRecurring.map((rule) => <li key={rule.id}><Link className="flex items-center justify-between gap-4 py-4" href={`/recurring/${rule.id}`}><div className="min-w-0"><p className="truncate font-semibold">{rule.merchant}</p><p className="mt-1 text-sm text-slate-500">每月 {rule.day_of_month} 日 · 下次 {rule.next_run_date}</p></div><p className="shrink-0 font-bold">{formatExpenseAmount(rule.amount, rule.currency)}</p></Link></li>)}</ul>}
    </section>
  );

  return (
    <main className="flex-1 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Notice success={single(params.success)} />
        <section className="rounded-3xl border border-slate-200 bg-[#181818]/95 p-5 text-white sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-sm font-semibold text-[#a3a3a3]">每月支出總覽</p><h1 className="mt-1 text-3xl font-bold">{month}</h1></div>
            <form className="flex gap-2" method="get">
              <input aria-label="選擇月份" className="min-h-11 rounded-xl border border-white/30 bg-white/10 px-3 text-white [color-scheme:dark]" defaultValue={month} name="month" type="month" />
              <button className="min-h-11 rounded-xl bg-[#4f8cff] px-4 font-semibold text-[#08111f]" type="submit">切換</button>
            </form>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:max-w-lg">
            <div className="rounded-2xl border border-slate-200 bg-[#1e1e1e] p-4"><p className="text-sm text-[#a3a3a3]">交易筆數</p><p className="mt-1 text-2xl font-bold">{expenses.length}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-[#1e1e1e] p-4"><p className="text-sm text-[#a3a3a3]">幣別數量</p><p className="mt-1 text-2xl font-bold">{totals.size}</p></div>
          </div>
        </section>

        {result.error ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900" role="alert">{result.error}</p>
        ) : expenses.length === 0 ? (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <h2 className="text-xl font-bold">這個月還沒有消費</h2><p className="mt-2 text-slate-600">新增第一筆消費後，統計會自動出現在這裡。</p>
              <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row"><Link className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-indigo-600 px-5 font-semibold text-white" href="/expenses/new">新增消費</Link><Link className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 px-5 font-semibold text-indigo-700" href="/import/chatgpt">匯入 ChatGPT</Link></div>
            </section>
            {recurringSection}
          </>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2">
              {[...totals.entries()].sort().map(([currency, cents]) => (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" key={currency}>
                  <p className="text-sm font-medium text-slate-500">本月支出 · {currency}</p><p className="mt-2 text-3xl font-bold">{formatMoneyFromCents(cents, currency)}</p>
                </div>
              ))}
            </section>
            {[...totals.keys()].sort().map((currency) => {
              const categories = [...(categoryTotals.get(currency) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]);
              const total = totals.get(currency) ?? 0;
              return (
                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" key={currency}>
                    <h2 className="text-xl font-bold">各類別支出 · {currency}</h2>
                    <div className="mt-5 space-y-4">{categories.map(([category, cents]) => (
                      <div key={category}><div className="flex justify-between gap-4 text-sm"><span className="font-medium">{category}</span><span>{formatMoneyFromCents(cents, currency)} · {Math.round((cents / total) * 100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${(cents / total) * 100}%` }} /></div></div>
                    ))}</div>
                  </section>
              );
            })}
            {recurringSection}
            {[...totals.keys()].sort().map((currency) => {
              const days = [...(dailyTotals.get(currency) ?? new Map()).entries()].sort();
              const maxDay = Math.max(...days.map(([, cents]) => cents), 1);
              return (
                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" key={currency}>
                    <h2 className="text-xl font-bold">每日趨勢 · {currency}</h2>
                    <div className="mt-5 flex min-h-44 items-end gap-2 overflow-x-auto pb-2">{days.map(([date, cents]) => (
                      <div className="flex min-w-10 flex-1 flex-col items-center justify-end gap-2" key={date} title={`${date}: ${formatMoneyFromCents(cents, currency)}`}><div className="w-full rounded-t-lg bg-violet-500" style={{ height: `${Math.max((cents / maxDay) * 130, 8)}px` }} /><span className="text-xs text-slate-500">{date.slice(8)}</span></div>
                    ))}</div>
                  </section>
              );
            })}
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between"><h2 className="text-xl font-bold">最近消費</h2><Link className="text-sm font-semibold text-indigo-600" href={`/expenses?month=${month}`}>查看全部</Link></div>
              <ul className="mt-3 divide-y divide-slate-100">{expenses.slice(0, 10).map((expense) => (
                <li key={expense.id}><Link className="flex items-center justify-between gap-4 py-4" href={`/expenses/${expense.id}`}><div className="min-w-0"><p className="truncate font-semibold">{expense.merchant}{(expense.receipt_image_path || expense.receipt_image_url) && <span aria-label="有收據附件" className="ml-2 text-sm" title="有收據附件">📎</span>}</p><p className="mt-1 text-sm text-slate-500">{expense.expense_date} · {expense.category}</p></div><p className="shrink-0 font-bold">{formatMoneyFromCents(moneyToCents(expense.amount), expense.currency)}</p></Link></li>
              ))}</ul>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
