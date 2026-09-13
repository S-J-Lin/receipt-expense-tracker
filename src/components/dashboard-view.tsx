import type { CSSProperties } from "react";
import Link from "next/link";
import { DashboardComparisonToggle } from "@/components/dashboard-comparison-toggle";
import { averageCents, calculateChange, categoryChanges, type CategoryChange, type ComparisonMode, type ComparisonPeriods, type CurrencyPeriodSummary, projectMonthCents } from "@/lib/dashboard-analysis";
import { daysInIsoMonth, inclusiveDayCount } from "@/lib/local-date";
import { formatExpenseAmount, formatMoneyFromCents, moneyToCents } from "@/lib/money";
import type { ExpenseWithDetails } from "@/types/expense";
import type { RecurringExpense } from "@/types/recurring-expense";

const chartColors = ["#4f8cff", "#8b5cf6", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#f97316", "#a3e635"];
const card = "min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 sm:p-6";

function donutStops(values: number[]): string[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.reduce<{ cursor: number; stops: string[] }>((result, value, index) => {
    const next = result.cursor + (total ? value / total * 100 : 0);
    return { cursor: next, stops: [...result.stops, `${chartColors[index % chartColors.length]} ${result.cursor}% ${next}%`] };
  }, { cursor: 0, stops: [] }).stops;
}

function rangeLabel(range: { start: string; end: string }) {
  const short = (value: string) => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
  return `${short(range.start)}–${short(range.end)}`;
}

function ChangeValue({ current, previous, currency }: { current: number; previous: number; currency: string }) {
  const change = calculateChange(current, previous);
  const arrow = change.kind === "increase" ? "↑" : change.kind === "decrease" ? "↓" : "—";
  const tone = change.kind === "increase" || change.kind === "new" ? "text-amber-800" : change.kind === "decrease" ? "text-emerald-700" : "text-slate-500";
  return <div className="mt-4 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
    <strong className={`text-lg ${tone}`}>{change.kind === "new" ? "新增支出" : `${arrow} ${Math.abs(change.percent ?? 0).toFixed(1)}%`}</strong>
    <span className="money-value text-sm text-slate-500">{change.differenceCents >= 0 ? "+" : "−"}{formatMoneyFromCents(Math.abs(change.differenceCents), currency)}</span>
  </div>;
}

function ComparisonCard({ title, period, current, previous, currency }: { title: string; period: ComparisonPeriods["week"]; current?: CurrencyPeriodSummary; previous?: CurrencyPeriodSummary; currency: string }) {
  const currentTotal = current?.totalCents ?? 0;
  const previousTotal = previous?.totalCents ?? 0;
  return <article className={card}>
    <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-500">{title} · {currency}</p><p className="mt-1 text-xs text-slate-500">{rangeLabel(period.current)}</p></div><span className="shrink-0 rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">{period.label}</span></div>
    <p className="dashboard-amount mt-4 font-bold text-slate-950">{formatMoneyFromCents(currentTotal, currency)}</p>
    <p className="mt-2 break-words text-sm text-slate-500">比較期 {rangeLabel(period.previous)}：<span className="money-value">{formatMoneyFromCents(previousTotal, currency)}</span></p>
    <ChangeValue current={currentTotal} currency={currency} previous={previousTotal} />
  </article>;
}

function Donut({ summary, currency }: { summary: CurrencyPeriodSummary; currency: string }) {
  const categories = [...summary.categoryTotals.entries()].sort((a, b) => b[1] - a[1]);
  const stops = donutStops(categories.map(([, value]) => value).filter((value) => value > 0));
  const style = { background: stops.length ? `conic-gradient(${stops.join(",")})` : "#2c2c2c" } as CSSProperties;
  return <section className={card}>
    <div><p className="text-sm font-semibold text-slate-500">本月分類分布 · {currency}</p><p className="dashboard-amount mt-2 font-bold">{formatMoneyFromCents(summary.totalCents, currency)}</p></div>
    {categories.length === 0 ? <p className="mt-5 text-sm text-slate-500">本月尚無消費資料。</p> : <div className="mt-6 grid min-w-0 gap-6 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center">
      <div aria-label={`${currency} 本月分類圓環圖`} className="relative mx-auto aspect-square w-36 shrink-0 rounded-full" role="img" style={style}><div className="absolute inset-7 flex items-center justify-center rounded-full bg-white text-center text-xs font-semibold text-slate-500">分類<br />占比</div></div>
      <ul className="min-w-0 space-y-3">{categories.map(([category, cents], index) => <li className="flex min-w-0 items-center justify-between gap-3 text-sm" key={category}><span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} /><span className="break-words">{category}</span></span><span className="money-value shrink-0 text-right">{formatMoneyFromCents(cents, currency)}<span className="ml-1 text-xs text-slate-500">{summary.totalCents ? `${Math.round((cents / summary.totalCents) * 100)}%` : "0%"}</span></span></li>)}</ul>
    </div>}
  </section>;
}

export function DashboardView({ month, mode, periods, monthExpenses, currentWeek, previousWeek, currentMonth, previousMonth, actualMonth, recurring, recurringError }: {
  month: string; mode: ComparisonMode; periods: ComparisonPeriods; monthExpenses: ExpenseWithDetails[];
  currentWeek: Map<string, CurrencyPeriodSummary>; previousWeek: Map<string, CurrencyPeriodSummary>;
  currentMonth: Map<string, CurrencyPeriodSummary>; previousMonth: Map<string, CurrencyPeriodSummary>;
  actualMonth: Map<string, CurrencyPeriodSummary>; recurring: RecurringExpense[]; recurringError: string | null;
}) {
  const currencies = [...new Set([...actualMonth.keys(), ...currentMonth.keys(), ...previousMonth.keys(), ...currentWeek.keys(), ...previousWeek.keys()])].sort();
  const monthDaysElapsed = inclusiveDayCount(periods.month.current.start, periods.month.current.end);
  return <>
    <DashboardComparisonToggle mode={mode} month={month} />

    {currencies.length === 0 ? <section className={card}><h2 className="text-lg font-bold">比較分析</h2><p className="mt-2 text-sm text-slate-500">尚無足夠資料可比較。</p></section> : <section aria-label="週與月比較" className="grid min-w-0 gap-4 lg:grid-cols-2">{currencies.map((currency) => <div className="contents" key={currency}><ComparisonCard current={currentWeek.get(currency)} currency={currency} period={periods.week} previous={previousWeek.get(currency)} title="本週" /><ComparisonCard current={currentMonth.get(currency)} currency={currency} period={periods.month} previous={previousMonth.get(currency)} title="本月" /></div>)}</section>}

    {currencies.length > 0 && <section aria-label="快速指標" className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{currencies.map((currency) => {
      const summary = currentMonth.get(currency) ?? { totalCents: 0, count: 0, categoryTotals: new Map(), fixedCents: 0, variableCents: 0 };
      const previous = previousMonth.get(currency);
      const previousDays = inclusiveDayCount(periods.month.previous.start, periods.month.previous.end);
      const daily = averageCents(summary.totalCents, monthDaysElapsed);
      const previousDaily = averageCents(previous?.totalCents ?? 0, previousDays);
      return <div className="contents" key={currency}>
        <article className={card}><p className="text-sm font-semibold text-slate-500">每日平均 · {currency}</p><p className="metric-amount mt-3 font-bold">{formatMoneyFromCents(daily, currency)}<span className="ml-1 text-sm font-medium text-slate-500">/ 日</span></p><p className="mt-2 text-xs text-slate-500">比較期 {formatMoneyFromCents(previousDaily, currency)} / 日</p></article>
        <article className={card}><p className="text-sm font-semibold text-slate-500">月底預估 · {currency}</p>{summary.totalCents === 0 ? <p className="mt-3 text-sm text-slate-500">本月尚無資料</p> : <><p className="metric-amount mt-3 font-bold">約 {formatMoneyFromCents(projectMonthCents(summary.totalCents, monthDaysElapsed, daysInIsoMonth(month)), currency)}</p><p className="mt-2 text-xs text-slate-500">預估值，不計入實際支出{monthDaysElapsed <= 3 ? "；月初波動較大" : ""}</p></>}</article>
        <article className={card}><p className="text-sm font-semibold text-slate-500">本月交易筆數 · {currency}</p><p className="metric-amount mt-3 font-bold">{summary.count} 筆</p><p className="mt-2 text-xs text-slate-500">截至 {periods.month.current.end}</p></article>
        <article className={card}><p className="text-sm font-semibold text-slate-500">平均每筆 · {currency}</p><p className="metric-amount mt-3 font-bold">{formatMoneyFromCents(averageCents(summary.totalCents, summary.count), currency)}</p><p className="mt-2 text-xs text-slate-500">以本月交易計算</p></article>
      </div>;
    })}</section>}

    {currencies.filter((currency) => actualMonth.has(currency)).map((currency) => <Donut currency={currency} key={currency} summary={actualMonth.get(currency)!} />)}

    {currencies.map((currency) => {
      const changes = categoryChanges(currentMonth.get(currency), previousMonth.get(currency));
      const row = (change: CategoryChange) => <li className="flex min-w-0 items-center justify-between gap-3 py-3" key={change.category}><span className="min-w-0 break-words font-medium">{change.category}</span><span className={`money-value shrink-0 text-right text-sm font-semibold ${change.differenceCents > 0 ? "text-amber-800" : change.differenceCents < 0 ? "text-emerald-700" : "text-slate-500"}`}>{change.differenceCents >= 0 ? "+" : "−"}{formatMoneyFromCents(Math.abs(change.differenceCents), currency)}<span className="ml-2 text-xs">{change.percent === null ? "新增" : `${change.percent >= 0 ? "+" : ""}${change.percent.toFixed(1)}%`}</span></span></li>;
      return <section className={card} key={`changes-${currency}`}><div><h2 className="text-lg font-bold">本月分類變化 · {currency}</h2><p className="mt-1 text-sm text-slate-500">{periods.month.label}，依金額變化排序</p></div>{changes.length === 0 ? <p className="mt-5 text-sm text-slate-500">尚無足夠資料可比較。</p> : <><ul className="mt-5 divide-y divide-slate-100">{changes.slice(0, 5).map(row)}</ul>{changes.length > 5 && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-indigo-700">查看全部分類（{changes.length}）</summary><ul className="divide-y divide-slate-100">{changes.slice(5).map(row)}</ul></details>}</>}</section>;
    })}

    <section className={card}><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-indigo-700">自動記帳</p><h2 className="mt-1 text-lg font-bold">每月固定扣款</h2><p className="mt-2 text-sm text-slate-500">到期自動計入本月支出。</p></div><Link className="shrink-0 rounded-xl border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700" href="/recurring">查看全部</Link></div>{recurringError ? <p className="mt-4 text-sm text-amber-800" role="alert">{recurringError}</p> : recurring.length === 0 ? <p className="mt-4 text-sm text-slate-500">目前沒有啟用中的固定扣款。</p> : <ul className="mt-4 divide-y divide-slate-100">{recurring.map((rule) => <li key={rule.id}><Link className="flex min-w-0 items-start justify-between gap-3 py-3" href={`/recurring/${rule.id}`} title={rule.merchant}><span className="min-w-0"><span className="line-clamp-2 break-words font-semibold">{rule.merchant}</span><span className="mt-1 block text-sm text-slate-500">每月 {rule.day_of_month} 日 · 下次 {rule.next_run_date}</span></span><span className="money-value shrink-0 font-bold">{formatExpenseAmount(rule.amount, rule.currency)}</span></Link></li>)}</ul>}</section>

    {currencies.filter((currency) => actualMonth.has(currency)).map((currency) => { const summary = actualMonth.get(currency)!; const total = summary.fixedCents + summary.variableCents; return <section className={card} key={`source-${currency}`}><h2 className="text-lg font-bold">固定支出 vs 非固定支出 · {currency}</h2><div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">固定支出</p><p className="metric-amount mt-2 font-bold">{formatMoneyFromCents(summary.fixedCents, currency)}</p><p className="mt-1 text-xs text-slate-500">{total ? Math.round(summary.fixedCents / total * 100) : 0}%</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">其他支出</p><p className="metric-amount mt-2 font-bold">{formatMoneyFromCents(summary.variableCents, currency)}</p><p className="mt-1 text-xs text-slate-500">{total ? Math.round(summary.variableCents / total * 100) : 0}%</p></div></div></section>; })}

    <section className={card}><div className="flex min-w-0 items-center justify-between gap-3"><h2 className="text-lg font-bold">最近消費</h2><Link className="shrink-0 text-sm font-semibold text-indigo-600" href={`/expenses?month=${month}`}>查看全部</Link></div>{monthExpenses.length === 0 ? <p className="mt-5 text-sm text-slate-500">本月尚無消費資料。</p> : <ul className="mt-3 divide-y divide-slate-100">{monthExpenses.slice(0, 10).map((expense) => <li key={expense.id}><Link className="flex min-w-0 items-start justify-between gap-3 py-4" href={`/expenses/${expense.id}`} title={expense.merchant}><span className="min-w-0 flex-1"><span className="line-clamp-2 break-words font-semibold">{expense.merchant}</span><span className="mt-1 block break-words text-sm text-slate-500">{expense.expense_date} · {expense.category} · {expense.source === "recurring" ? "固定支出" : expense.source === "chatgpt_import" ? "ChatGPT" : expense.source === "receipt_upload" ? "收據" : "手動"}</span></span><span className="money-value shrink-0 font-bold">{formatMoneyFromCents(moneyToCents(expense.amount), expense.currency)}</span></Link></li>)}</ul>}</section>
  </>;
}
