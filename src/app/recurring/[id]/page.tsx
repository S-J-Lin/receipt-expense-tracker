import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelRecurringAction, deleteRecurringAction, generateRecurringNowAction, pauseRecurringAction, resumeRecurringAction } from "@/app/recurring/actions";
import { Notice } from "@/components/notice";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { getRecurringExpense, getRecurringHistory } from "@/lib/recurring-expense-data";
import { formatExpenseAmount } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "固定支出規則" };
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function RecurringDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params; const query = await searchParams;
  const [rule, history] = await Promise.all([getRecurringExpense(id), getRecurringHistory(id)]);
  if (rule.error) return <main className="flex-1 px-4 py-6"><p className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{rule.error}</p></main>;
  if (!rule.data) notFound();
  const value = rule.data;
  const ended = Boolean(value.end_date && value.next_run_date > value.end_date);
  const status = value.cancelled_at ? "已取消" : ended ? "已結束" : value.is_active ? "啟用中" : "已暫停";
  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-4xl space-y-5">
    <Notice error={one(query.error)} success={one(query.success)} />
    <div><Link className="ui-link text-sm" href="/recurring">← 固定支出</Link>
      <div className="mt-2 flex min-w-0 flex-wrap items-end justify-between gap-3"><div className="min-w-0"><h1 className="break-words text-2xl font-bold sm:text-3xl">{value.merchant}</h1><p className="mt-1 ui-muted">{status} · 每月 {value.day_of_month} 日</p></div>{!value.cancelled_at && <Link className="ui-btn ui-btn-secondary" href={`/recurring/${id}/edit`}>編輯</Link>}</div></div>
    <dl className="ui-card grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[["金額", formatExpenseAmount(value.amount, value.currency)], ["類別", value.category], ["下次執行", value.next_run_date], ["最近產生", value.last_generated_for ?? "—"], ["開始", value.start_date], ["結束", value.end_date ?? "無"], ["付款方式", value.payment_method ?? "—"], ["時區", value.timezone]].map(([label, text]) => <div className="min-w-0" key={label}><dt className="ui-muted">{label}</dt><dd className="break-words font-semibold">{text}</dd></div>)}</dl>
    {!value.cancelled_at && <section aria-labelledby="rule-actions" className="ui-card"><h2 className="text-lg font-bold" id="rule-actions">規則操作</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">
      {value.is_active ? <form action={pauseRecurringAction.bind(null, id)}><button className="ui-btn ui-btn-secondary w-full" type="submit">暫停</button></form> : <form action={resumeRecurringAction.bind(null, id)}><button className="ui-btn ui-btn-secondary w-full" type="submit">恢復（不補建暫停月份）</button></form>}
      <form action={cancelRecurringAction.bind(null, id)}><ConfirmSubmitButton className="ui-btn ui-btn-danger w-full" message="取消後此規則不能再恢復，只能建立新規則。確定要取消嗎？" name="confirm_cancel">取消規則（不可恢復）</ConfirmSubmitButton></form>
    </div></section>}
    {!value.cancelled_at && <section aria-labelledby="rule-generate" className="ui-card"><h2 className="text-lg font-bold" id="rule-generate">立即建立一次</h2><p className="mt-2 text-sm ui-muted">「計入本期」同月只會有一筆（已存在時直接開啟）。「額外建立」會另外新增一筆，不影響正常排程。日期為今天。</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row"><form action={generateRecurringNowAction.bind(null, id)} className="flex-1"><input name="mode" type="hidden" value="current_period" /><button className="ui-btn ui-btn-primary w-full" type="submit">計入本期</button></form><form action={generateRecurringNowAction.bind(null, id)} className="flex-1"><input name="mode" type="hidden" value="extra" /><ConfirmSubmitButton className="ui-btn ui-btn-secondary w-full" message="會再新增一筆相同金額的消費。確定要額外建立嗎？" name="confirm_extra">額外建立一次</ConfirmSubmitButton></form></div></section>}
    <section aria-labelledby="rule-history" className="ui-card"><h2 className="text-lg font-bold" id="rule-history">已產生紀錄 <span className="text-sm font-normal ui-muted">{history.data.length}</span></h2>{history.error ? <p className="mt-3 text-red-600" role="alert">{history.error}</p> : history.data.length === 0 ? <p className="mt-3 ui-muted">尚未產生消費。</p> : <ul className="mt-2 divide-y divide-[var(--border)]">{history.data.map((expense) => <li key={expense.id}><Link className="flex min-h-12 items-center justify-between gap-4 py-2" href={`/expenses/${expense.id}`}><span>{expense.expense_date} · {expense.category}</span><strong className="money-value">{formatExpenseAmount(expense.amount, expense.currency)}</strong></Link></li>)}</ul>}</section>
    <section aria-labelledby="rule-delete" className="rounded-2xl border border-red-300 bg-red-50 p-4 sm:p-6"><h2 className="font-bold text-red-800" id="rule-delete">刪除規則</h2><p className="mt-2 text-sm text-red-700">歷史消費會保留，只是不再連結到此規則。請輸入 DELETE 確認。</p><form action={deleteRecurringAction.bind(null, id)} className="mt-3 flex gap-3"><label className="sr-only" htmlFor="delete-confirm">輸入 DELETE 確認刪除</label><input autoCapitalize="characters" autoComplete="off" className="min-h-12 min-w-0 flex-1 rounded-xl border px-3" id="delete-confirm" name="confirm" pattern="DELETE" placeholder="DELETE" required spellCheck={false} /><button className="ui-btn ui-btn-danger" type="submit">刪除</button></form></section>
  </div></main>;
}
