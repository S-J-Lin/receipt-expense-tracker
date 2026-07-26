import Link from "next/link";
import { Notice } from "@/components/notice";
import { getCurrentMonth, getExpenses, isValidMonth } from "@/lib/expenses";
import { formatMoneyFromCents, moneyToCents } from "@/lib/money";

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requestedMonth = single(params.month);
  const month = isValidMonth(requestedMonth) ? requestedMonth : getCurrentMonth();
  const result = await getExpenses({ month });
  const expenses = result.data ?? [];

  const totals = new Map<string, number>();
  const categoryTotals = new Map<string, Map<string, number>>();
  const dailyTotals = new Map<string, Map<string, number>>();
  for (const expense of expenses) {
    const cents = moneyToCents(expense.amount);
    totals.set(expense.currency, (totals.get(expense.currency) ?? 0) + cents);
    const categories = categoryTotals.get(expense.currency) ?? new Map<string, number>();
    categories.set(expense.category, (categories.get(expense.category) ?? 0) + cents);
    categoryTotals.set(expense.currency, categories);
    const days = dailyTotals.get(expense.currency) ?? new Map<string, number>();
    days.set(expense.expense_date, (days.get(expense.expense_date) ?? 0) + cents);
    dailyTotals.set(expense.currency, days);
  }

  return (
    <main className="flex-1 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Notice success={single(params.success)} />
        <section className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-5 text-white shadow-lg sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-sm font-semibold text-indigo-100">每月支出總覽</p><h1 className="mt-1 text-3xl font-bold">{month}</h1></div>
            <form className="flex gap-2" method="get">
              <input aria-label="選擇月份" className="min-h-11 rounded-xl border border-white/30 bg-white/10 px-3 text-white [color-scheme:dark]" defaultValue={month} name="month" type="month" />
              <button className="min-h-11 rounded-xl bg-white px-4 font-semibold text-indigo-700" type="submit">切換</button>
            </form>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:max-w-lg">
            <div className="rounded-2xl bg-white/10 p-4"><p className="text-sm text-indigo-100">交易筆數</p><p className="mt-1 text-2xl font-bold">{expenses.length}</p></div>
            <div className="rounded-2xl bg-white/10 p-4"><p className="text-sm text-indigo-100">幣別數量</p><p className="mt-1 text-2xl font-bold">{totals.size}</p></div>
          </div>
        </section>

        {result.error ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900" role="alert">{result.error}</p>
        ) : expenses.length === 0 ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold">這個月還沒有消費</h2><p className="mt-2 text-slate-600">新增第一筆消費後，統計會自動出現在這裡。</p>
            <Link className="mt-5 inline-flex min-h-12 items-center rounded-2xl bg-indigo-600 px-5 font-semibold text-white" href="/expenses/new">新增消費</Link>
          </section>
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
              const days = [...(dailyTotals.get(currency) ?? new Map()).entries()].sort();
              const maxDay = Math.max(...days.map(([, cents]) => cents), 1);
              return (
                <div className="grid gap-6 lg:grid-cols-2" key={currency}>
                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-xl font-bold">各類別支出 · {currency}</h2>
                    <div className="mt-5 space-y-4">{categories.map(([category, cents]) => (
                      <div key={category}><div className="flex justify-between gap-4 text-sm"><span className="font-medium">{category}</span><span>{formatMoneyFromCents(cents, currency)} · {Math.round((cents / total) * 100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${(cents / total) * 100}%` }} /></div></div>
                    ))}</div>
                  </section>
                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-xl font-bold">每日趨勢 · {currency}</h2>
                    <div className="mt-5 flex min-h-44 items-end gap-2 overflow-x-auto pb-2">{days.map(([date, cents]) => (
                      <div className="flex min-w-10 flex-1 flex-col items-center justify-end gap-2" key={date} title={`${date}: ${formatMoneyFromCents(cents, currency)}`}><div className="w-full rounded-t-lg bg-violet-500" style={{ height: `${Math.max((cents / maxDay) * 130, 8)}px` }} /><span className="text-xs text-slate-500">{date.slice(8)}</span></div>
                    ))}</div>
                  </section>
                </div>
              );
            })}
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between"><h2 className="text-xl font-bold">最近消費</h2><Link className="text-sm font-semibold text-indigo-600" href={`/expenses?month=${month}`}>查看全部</Link></div>
              <ul className="mt-3 divide-y divide-slate-100">{expenses.slice(0, 10).map((expense) => (
                <li key={expense.id}><Link className="flex items-center justify-between gap-4 py-4" href={`/expenses/${expense.id}`}><div className="min-w-0"><p className="truncate font-semibold">{expense.merchant}</p><p className="mt-1 text-sm text-slate-500">{expense.expense_date} · {expense.category}</p></div><p className="shrink-0 font-bold">{formatMoneyFromCents(moneyToCents(expense.amount), expense.currency)}</p></Link></li>
              ))}</ul>
            </section>
          </>
        )}
        <div className="sticky bottom-4 ml-auto flex gap-2"><Link className="flex min-h-14 items-center rounded-full bg-indigo-600 px-5 font-bold text-white shadow-lg" href="/expenses/new">＋ 新增消費</Link></div>
      </div>
    </main>
  );
}
