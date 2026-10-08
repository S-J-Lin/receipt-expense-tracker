import type { CSSProperties } from "react";
import Link from "next/link";
import { DashboardComparisonToggle } from "@/components/dashboard-comparison-toggle";
import { averageCents, calculateChange, categoryChanges, type CategoryChange, type ComparisonMode, type ComparisonPeriods, type CurrencyPeriodSummary, projectMonthCents } from "@/lib/dashboard-analysis";
import { daysInIsoMonth, inclusiveDayCount } from "@/lib/local-date";
import { formatExpenseAmount, formatMoneyFromCents, moneyToCents } from "@/lib/money";
import type { ExpenseWithDetails } from "@/types/expense";
import type { RecurringExpense } from "@/types/recurring-expense";

// Statistics rules (unchanged): the monthly total counts every expense once,
// including rent and generated recurring expenses; daily analysis, comparisons
// and projections exclude header category 房租; the donut includes rent;
// currencies are never added together.

const chartColors = ["#4f8cff", "#8b5cf6", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#f97316", "#a3e635"];
const RECENT_LIMIT = 5;
const SOURCE_LABELS: Record<string, string> = { recurring: "固定支出", chatgpt_import: "ChatGPT", receipt_upload: "收據", manual: "手動" };

function donutStops(values: number[]): string[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.reduce<{ cursor: number; stops: string[] }>((result, value, index) => {
    const next = result.cursor + (total ? value / total * 100 : 0);
    return { cursor: next, stops: [...result.stops, `${chartColors[index % chartColors.length]} ${result.cursor}% ${next}%`] };
  }, { cursor: 0, stops: [] }).stops;
}

function rangeLabel(range: { start: string; end: string }) {
  const short = (value: string) => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
  return range.start === range.end ? short(range.start) : `${short(range.start)}–${short(range.end)}`;
}

function Money({ cents, currency, className = "" }: { cents: number; currency: string; className?: string }) {
  const value = formatMoneyFromCents(cents, currency);
  return <span className={`money-value ${className}`} title={value}>{value}</span>;
}

function ChangeValue({ current, previous, currency }: { current: number; previous: number; currency: string }) {
  const change = calculateChange(current, previous);
  const arrow = change.kind === "increase" ? "↑" : change.kind === "decrease" ? "↓" : "→";
  const tone = change.kind === "increase" || change.kind === "new" ? "text-amber-800" : change.kind === "decrease" ? "text-emerald-700" : "ui-muted";
  const words = change.kind === "increase" ? "增加" : change.kind === "decrease" ? "減少" : change.kind === "new" ? "比較期為 0" : "持平";
  return <p className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
    <strong className={tone}>{change.kind === "new" ? "新增支出" : `${arrow} ${Math.abs(change.percent ?? 0).toFixed(1)}%`}</strong>
    <span className="sr-only">{words}</span>
    <span className="money-value ui-muted">{change.differenceCents >= 0 ? "+" : "−"}{formatMoneyFromCents(Math.abs(change.differenceCents), currency)}</span>
  </p>;
}

function ComparisonCard({ title, period, current, previous, currency }: { title: string; period: ComparisonPeriods["week"]; current?: CurrencyPeriodSummary; previous?: CurrencyPeriodSummary; currency: string }) {
  const currentTotal = current?.totalCents ?? 0;
  const previousTotal = previous?.totalCents ?? 0;
  return <article className="ui-card ui-compact">
    <div className="flex min-w-0 items-baseline justify-between gap-3"><h3 className="text-sm font-semibold ui-muted">{title}</h3><p className="shrink-0 text-xs ui-muted">{rangeLabel(period.current)}</p></div>
    <p className="dashboard-amount mt-2 font-bold"><Money cents={currentTotal} currency={currency} /></p>
    <p className="mt-1 break-words text-xs ui-muted">比較期 {rangeLabel(period.previous)}：<Money cents={previousTotal} currency={currency} /></p>
    <ChangeValue current={currentTotal} currency={currency} previous={previousTotal} />
  </article>;
}

function Metric({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return <article className="ui-card ui-compact min-w-0"><h3 className="text-xs font-semibold ui-muted">{label}</h3><p className="metric-amount mt-1.5 font-bold">{children}</p>{note && <p className="mt-1 text-xs ui-muted">{note}</p>}</article>;
}

function DistributionCard({ summary, currency }: { summary: CurrencyPeriodSummary; currency: string }) {
  const categories = [...summary.categoryTotals.entries()].sort((a, b) => b[1] - a[1]);
  const stops = donutStops(categories.map(([, value]) => value).filter((value) => value > 0));
  const style = { background: stops.length ? `conic-gradient(${stops.join(",")})` : "#2c2c2c" } as CSSProperties;
  const allocated = categories.reduce((sum, [, cents]) => sum + cents, 0);
  const unallocated = summary.totalCents - allocated;
  const total = summary.fixedCents + summary.variableCents;
  const fixedPercent = total ? Math.round(summary.fixedCents / total * 100) : 0;
  const listId = `distribution-${currency}`;
  return <section aria-labelledby={`${listId}-title`} className="ui-card">
    <div className="flex min-w-0 items-baseline justify-between gap-3"><h2 className="text-lg font-bold" id={`${listId}-title`}>本月支出分布 · {currency}</h2><span className="shrink-0 text-xs ui-muted">含房租</span></div>
    <p className="dashboard-amount mt-1 font-bold"><Money cents={summary.totalCents} currency={currency} /></p>
    {categories.length === 0 ? <p className="mt-4 text-sm ui-muted">本月尚無消費資料。</p> : <div className="mt-4 grid min-w-0 gap-5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center">
      <div aria-describedby={listId} aria-label={`${currency} 分類圓環圖，數值見右側清單`} className="relative mx-auto aspect-square w-32 shrink-0 rounded-full" role="img" style={style}><div className="absolute inset-6 rounded-full bg-[var(--card)]" /></div>
      <ul className="min-w-0 space-y-2.5" id={listId}>{categories.map(([category, cents], index) => <li className="flex min-w-0 items-center justify-between gap-3 text-sm" key={category}><span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cents > 0 ? chartColors[index % chartColors.length] : "transparent", border: cents > 0 ? undefined : "1px solid #6e6e6e" }} /><span className="line-clamp-2 break-words">{category}</span></span><span className="shrink-0 text-right"><Money cents={cents} currency={currency} /><span className="ml-1.5 text-xs ui-muted">{summary.totalCents ? `${Math.round((cents / summary.totalCents) * 100)}%` : "0%"}</span></span></li>)}
        {Math.abs(unallocated) > 1 && <li className="flex min-w-0 items-center justify-between gap-3 border-t border-[var(--border)] pt-2.5 text-sm ui-muted"><span className="min-w-0">未分配差額<span className="block text-xs">收據總額與明細合計的差額，僅顯示、不修改帳目</span></span><span className="shrink-0 text-right"><Money cents={unallocated} currency={currency} /></span></li>}
      </ul>
    </div>}
    {total > 0 && <div className="mt-5 border-t border-[var(--border)] pt-4">
      <div className="flex justify-between gap-3 text-sm"><span>固定支出 <Money className="font-semibold" cents={summary.fixedCents} currency={currency} /></span><span className="text-right">其他 <Money className="font-semibold" cents={summary.variableCents} currency={currency} /></span></div>
      <div aria-label={`固定支出佔 ${fixedPercent}%`} className="mt-2 flex h-2 overflow-hidden rounded-full bg-[var(--border)]" role="img"><span className="bg-[#8b5cf6]" style={{ width: `${fixedPercent}%` }} /></div>
      <p className="mt-1 text-xs ui-muted">固定支出指由固定支出規則自動產生的消費（{fixedPercent}%）。</p>
    </div>}
  </section>;
}

export function DashboardView({ month, mode, periods, monthExpenses, currentWeek, previousWeek, currentMonth, previousMonth, actualMonth, recurring, recurringError, isCurrentMonth }: {
  month: string; mode: ComparisonMode; periods: ComparisonPeriods; monthExpenses: ExpenseWithDetails[];
  currentWeek: Map<string, CurrencyPeriodSummary>; previousWeek: Map<string, CurrencyPeriodSummary>;
  currentMonth: Map<string, CurrencyPeriodSummary>; previousMonth: Map<string, CurrencyPeriodSummary>;
  actualMonth: Map<string, CurrencyPeriodSummary>; recurring: RecurringExpense[]; recurringError: string | null; isCurrentMonth: boolean;
}) {
  const currencies = [...new Set([...actualMonth.keys(), ...currentMonth.keys(), ...previousMonth.keys(), ...currentWeek.keys(), ...previousWeek.keys()])].sort();
  const monthDaysElapsed = inclusiveDayCount(periods.month.current.start, periods.month.current.end);
  const recent = monthExpenses.slice(0, RECENT_LIMIT);
  return <>
    <section aria-labelledby="recent-title" className="ui-card">
      <div className="flex min-w-0 items-center justify-between gap-3"><h2 className="text-lg font-bold" id="recent-title">最近消費</h2><Link className="ui-link shrink-0 text-sm" href={`/expenses?month=${month}`}>查看全部 →</Link></div>
      {recent.length === 0 ? <p className="mt-3 text-sm ui-muted">本月尚無消費資料。</p> : <ul className="mt-1 divide-y divide-[var(--border)]">{recent.map((expense) => <li key={expense.id}><Link className="flex min-h-14 min-w-0 items-center justify-between gap-3 py-2.5" href={`/expenses/${expense.id}`}><span className="min-w-0 flex-1"><span className="line-clamp-2 break-words font-semibold">{expense.merchant}</span><span className="mt-0.5 block break-words text-xs ui-muted">{expense.expense_date} · {expense.category} · {SOURCE_LABELS[expense.source] ?? expense.source}</span></span><Money cents={moneyToCents(expense.amount)} className="shrink-0 font-semibold" currency={expense.currency} /></Link></li>)}</ul>}
    </section>

    <section aria-labelledby="daily-analysis-title" className="space-y-3">
      <div className="ui-card ui-compact space-y-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><div className="min-w-0"><h2 className="text-lg font-bold" id="daily-analysis-title">日常消費分析</h2><p className="text-xs ui-muted">週／月比較與預估採日常口徑：排除類別為房租的消費，其他固定支出仍計入。</p></div><span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">不含房租</span></div>
        <DashboardComparisonToggle mode={mode} month={month} />
      </div>
      {currencies.length === 0 ? <p className="ui-card ui-compact text-sm ui-muted">尚無足夠資料可比較。</p> : currencies.map((currency) => {
        const summary = currentMonth.get(currency) ?? { totalCents: 0, count: 0, categoryTotals: new Map(), fixedCents: 0, variableCents: 0 };
        const previous = previousMonth.get(currency);
        const previousDays = inclusiveDayCount(periods.month.previous.start, periods.month.previous.end);
        const daily = averageCents(summary.totalCents, monthDaysElapsed);
        const previousDaily = averageCents(previous?.totalCents ?? 0, previousDays);
        return <div aria-label={`${currency} 日常消費`} className="space-y-3" key={currency} role="group">
          {currencies.length > 1 && <h3 className="px-1 text-sm font-semibold ui-muted">{currency}</h3>}
          <div className="grid min-w-0 gap-3 sm:grid-cols-2"><ComparisonCard current={currentWeek.get(currency)} currency={currency} period={periods.week} previous={previousWeek.get(currency)} title={isCurrentMonth ? "本週" : "月底那週"} /><ComparisonCard current={currentMonth.get(currency)} currency={currency} period={periods.month} previous={previousMonth.get(currency)} title={isCurrentMonth ? "本月" : "當月"} /></div>
          <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="每日平均" note={`比較期 ${formatMoneyFromCents(previousDaily, currency)} / 日`}><Money cents={daily} currency={currency} /></Metric>
            {isCurrentMonth
              ? <Metric label="月底日常預估" note={summary.totalCents === 0 ? "尚無日常消費" : monthDaysElapsed <= 3 ? "月初波動較大" : "依目前速度估算"}>{summary.totalCents === 0 ? "—" : <>約 <Money cents={projectMonthCents(summary.totalCents, monthDaysElapsed, daysInIsoMonth(month))} currency={currency} /></>}</Metric>
              : <Metric label="當月日常合計" note="整月實際值"><Money cents={summary.totalCents} currency={currency} /></Metric>}
            <Metric label="日常交易" note="不含房租">{summary.count} 筆</Metric>
            <Metric label="平均每筆" note="不含房租"><Money cents={averageCents(summary.totalCents, summary.count)} currency={currency} /></Metric>
          </div>
        </div>;
      })}
    </section>

    {currencies.filter((currency) => actualMonth.has(currency)).map((currency) => <DistributionCard currency={currency} key={currency} summary={actualMonth.get(currency)!} />)}

    {currencies.map((currency) => {
      const changes = categoryChanges(currentMonth.get(currency), previousMonth.get(currency));
      const row = (change: CategoryChange) => <li className="flex min-w-0 items-center justify-between gap-3 py-2.5" key={change.category}><span className="min-w-0 break-words">{change.category}</span><span className={`money-value shrink-0 text-right text-sm font-semibold ${change.differenceCents > 0 ? "text-amber-800" : change.differenceCents < 0 ? "text-emerald-700" : "ui-muted"}`}>{change.differenceCents >= 0 ? "+" : "−"}{formatMoneyFromCents(Math.abs(change.differenceCents), currency)}<span className="ml-2 text-xs">{change.percent === null ? "新增" : `${change.percent >= 0 ? "+" : ""}${change.percent.toFixed(1)}%`}</span></span></li>;
      return <section aria-labelledby={`changes-${currency}`} className="ui-card" key={`changes-${currency}`}><h2 className="text-lg font-bold" id={`changes-${currency}`}>分類變化 · {currency}</h2><p className="mt-0.5 text-xs ui-muted">不含房租 · {periods.month.label} · 依變化金額排序</p>{changes.length === 0 ? <p className="mt-3 text-sm ui-muted">尚無足夠資料可比較。</p> : <><ul className="mt-2 divide-y divide-[var(--border)]">{changes.slice(0, 5).map(row)}</ul>{changes.length > 5 && <details className="mt-1"><summary className="text-sm font-semibold text-[var(--accent)]">查看全部分類（{changes.length}）</summary><ul className="divide-y divide-[var(--border)]">{changes.slice(5).map(row)}</ul></details>}</>}</section>;
    })}

    <section aria-labelledby="recurring-title" className="ui-card"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-lg font-bold" id="recurring-title">每月固定扣款</h2><p className="mt-0.5 text-xs ui-muted">啟用中的規則；到期日自動建立正式消費。</p></div><Link className="ui-link shrink-0 text-sm" href="/recurring">管理 →</Link></div>{recurringError ? <p className="mt-3 text-sm text-amber-800" role="alert">{recurringError}</p> : recurring.length === 0 ? <p className="mt-3 text-sm ui-muted">目前沒有啟用中的固定扣款。</p> : <ul className="mt-1 divide-y divide-[var(--border)]">{recurring.map((rule) => <li key={rule.id}><Link className="flex min-h-14 min-w-0 items-center justify-between gap-3 py-2.5" href={`/recurring/${rule.id}`}><span className="min-w-0"><span className="line-clamp-2 break-words font-semibold">{rule.merchant}</span><span className="mt-0.5 block text-xs ui-muted">每月 {rule.day_of_month} 日 · 下次 {rule.next_run_date}</span></span><span className="money-value shrink-0 font-semibold">{formatExpenseAmount(rule.amount, rule.currency)}</span></Link></li>)}</ul>}</section>
  </>;
}
