import { DashboardView } from "@/components/dashboard-view";
import { Notice } from "@/components/notice";
import { comparisonMode, comparisonPeriods, dashboardQueryRange, summarizeExpenses } from "@/lib/dashboard-analysis";
import { getCurrentMonth, getExpenses, isValidMonth } from "@/lib/expenses";
import { localIsoDate, monthEnd, monthStart } from "@/lib/local-date";
import { formatMoneyFromCents } from "@/lib/money";
import { getRecurringExpenses } from "@/lib/recurring-expense-data";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requestedMonth = single(params.month);
  const month = isValidMonth(requestedMonth) ? requestedMonth : getCurrentMonth();
  const mode = comparisonMode(single(params.comparison));
  const today = localIsoDate();
  const periods = comparisonPeriods(month, mode, today);
  const queryRange = dashboardQueryRange(month, mode, today);
  const [result, recurringResult] = await Promise.all([
    getExpenses({ start: queryRange.start, end: queryRange.end }),
    getRecurringExpenses(),
  ]);
  const expenses = result.data ?? [];
  const selectedStart = monthStart(month);
  const selectedEnd = monthEnd(month);
  const monthExpenses = expenses.filter((expense) => expense.expense_date >= selectedStart && expense.expense_date <= selectedEnd);
  const actualMonth = summarizeExpenses(monthExpenses, { start: selectedStart, end: selectedEnd });
  const currentWeek = summarizeExpenses(expenses, periods.week.current);
  const previousWeek = summarizeExpenses(expenses, periods.week.previous);
  const currentMonth = summarizeExpenses(expenses, periods.month.current);
  const previousMonth = summarizeExpenses(expenses, periods.month.previous);
  const activeRecurring = recurringResult.data.filter((rule) => rule.is_active && !rule.cancelled_at && (!rule.end_date || rule.next_run_date <= rule.end_date));

  return <main className="dashboard-page flex-1 px-4 py-6 text-slate-900 sm:px-6">
    <div className="mx-auto flex min-w-0 max-w-5xl flex-col gap-5 sm:gap-6">
      <Notice success={single(params.success)} />
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-[#181818]/95 p-5 text-white sm:p-7">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0"><p className="text-sm font-semibold text-[#a3a3a3]">每月支出總覽</p><h1 className="mt-1 break-words text-2xl font-bold sm:text-3xl">{month}</h1></div>
          <form className="flex min-w-0 flex-col gap-2 min-[360px]:flex-row" method="get">
            <input name="comparison" type="hidden" value={mode} />
            <input aria-label="選擇月份" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/30 bg-white/10 px-3 text-white [color-scheme:dark]" defaultValue={month} name="month" type="month" />
            <button className="min-h-11 shrink-0 rounded-xl bg-[#4f8cff] px-4 font-semibold text-[#08111f]" type="submit">切換月份</button>
          </form>
        </div>
        {actualMonth.size === 0 ? <div className="mt-6 rounded-xl border border-slate-200 bg-[#1e1e1e] p-4"><p className="text-sm text-[#a3a3a3]">本月總支出</p><p className="mt-2 text-xl font-bold">尚無資料</p></div> : <div className="mt-6 grid min-w-0 gap-3 sm:grid-cols-2">{[...actualMonth.entries()].sort().map(([currency, summary]) => <div className="min-w-0 rounded-xl border border-slate-200 bg-[#1e1e1e] p-4" key={currency}><p className="text-sm text-[#a3a3a3]">本月總支出 · {currency}</p><p className="dashboard-amount mt-2 font-bold">{formatMoneyFromCents(summary.totalCents, currency)}</p></div>)}</div>}
      </section>
      {result.error && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900" role="alert">{result.error}</p>}
      <DashboardView actualMonth={actualMonth} currentMonth={currentMonth} currentWeek={currentWeek} mode={mode} month={month} monthExpenses={monthExpenses} periods={periods} previousMonth={previousMonth} previousWeek={previousWeek} recurring={activeRecurring} recurringError={recurringResult.error} />
    </div>
  </main>;
}
