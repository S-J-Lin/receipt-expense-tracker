import Link from "next/link";
import { DashboardView } from "@/components/dashboard-view";
import { Notice } from "@/components/notice";
import { comparisonMode, comparisonPeriods, dashboardQueryRange, summarizeDailyExpenses, summarizeExpenses } from "@/lib/dashboard-analysis";
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
  const isCurrentMonth = month === today.slice(0, 7);
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
  const currentWeek = summarizeDailyExpenses(expenses, periods.week.current);
  const previousWeek = summarizeDailyExpenses(expenses, periods.week.previous);
  const currentMonth = summarizeDailyExpenses(expenses, periods.month.current);
  const previousMonth = summarizeDailyExpenses(expenses, periods.month.previous);
  const activeRecurring = recurringResult.data.filter((rule) => rule.is_active && !rule.cancelled_at && (!rule.end_date || rule.next_run_date <= rule.end_date));
  const totals = [...actualMonth.entries()].sort(([a], [b]) => a.localeCompare(b));

  return <main className="dashboard-page flex-1 px-4 py-5 sm:px-6 sm:py-6">
    <div className="mx-auto flex min-w-0 max-w-5xl flex-col gap-4 sm:gap-5">
      <Notice success={single(params.success)} />
      <section aria-labelledby="dashboard-title" className="ui-card">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0"><h1 className="text-sm font-semibold ui-muted" id="dashboard-title">每月支出總覽</h1><p className="mt-1 text-2xl font-bold sm:text-3xl">{month}{isCurrentMonth ? <span className="ml-2 align-middle text-sm font-medium ui-muted">本月</span> : null}</p></div>
          <form className="flex min-w-0 gap-2" method="get">
            <input name="comparison" type="hidden" value={mode} />
            <label className="sr-only" htmlFor="dashboard-month">選擇月份</label>
            <input className="min-h-11 min-w-0 flex-1 rounded-xl border px-3 [color-scheme:dark]" defaultValue={month} id="dashboard-month" name="month" type="month" />
            <button className="ui-btn ui-btn-secondary shrink-0" type="submit">切換</button>
          </form>
        </div>
        {!result.data ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><p className="font-semibold">無法讀取本月資料，統計未顯示，以免把讀取失敗誤當成 0。</p><p className="mt-1 break-words">{result.error}</p><Link className="ui-link" href={`/?month=${month}&comparison=${mode}`}>重新載入</Link></div>
          : totals.length === 0 ? <div className="mt-5"><p className="text-sm ui-muted">本月總支出</p><p className="mt-1 text-xl font-bold">本月尚無消費</p><div className="mt-3 flex flex-wrap gap-2"><Link className="ui-btn ui-btn-primary" href="/expenses/new">新增消費</Link><Link className="ui-btn ui-btn-secondary" href="/import/chatgpt">匯入 ChatGPT JSON</Link></div></div>
          : <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">{totals.map(([currency, summary]) => {
            const value = formatMoneyFromCents(summary.totalCents, currency);
            return <div className="min-w-0" key={currency}><p className="text-sm ui-muted">本月總支出 · {currency}</p><p className="dashboard-amount mt-1 font-bold" title={value}>{value}</p><p className="mt-1 text-xs ui-muted">{summary.count} 筆 · 含房租與固定支出</p></div>;
          })}</div>}
      </section>
      {result.data && <DashboardView actualMonth={actualMonth} currentMonth={currentMonth} currentWeek={currentWeek} isCurrentMonth={isCurrentMonth} mode={mode} month={month} monthExpenses={monthExpenses} periods={periods} previousMonth={previousMonth} previousWeek={previousWeek} recurring={activeRecurring} recurringError={recurringResult.error} />}
    </div>
  </main>;
}
