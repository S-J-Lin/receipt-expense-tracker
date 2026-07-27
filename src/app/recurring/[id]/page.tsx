import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelRecurringAction, deleteRecurringAction, generateRecurringNowAction, pauseRecurringAction, resumeRecurringAction } from "@/app/recurring/actions";
import { Notice } from "@/components/notice";
import { getRecurringExpense, getRecurringHistory } from "@/lib/recurring-expense-data";
import { formatExpenseAmount } from "@/lib/money";

export const dynamic = "force-dynamic";
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function RecurringDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params; const query = await searchParams; const [rule, history] = await Promise.all([getRecurringExpense(id), getRecurringHistory(id)]); if (!rule.data) notFound();
  const value = rule.data; const status = value.cancelled_at ? "已取消" : value.is_active ? "啟用中" : "已暫停／結束";
  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-4xl space-y-6">
    <Notice error={one(query.error)} success={one(query.success)} />
    <div><Link className="text-sm font-semibold text-indigo-600" href="/recurring">← 固定支出</Link><div className="mt-3 flex items-end justify-between gap-4"><div><h1 className="text-3xl font-bold">{value.merchant}</h1><p className="mt-2 text-slate-500">{status} · 每月 {value.day_of_month} 日</p></div><Link className="rounded-xl border border-indigo-200 px-4 py-3 font-semibold text-indigo-700" href={`/recurring/${id}/edit`}>編輯</Link></div></div>
    <section className="grid grid-cols-2 gap-3 rounded-3xl border border-slate-200 bg-white p-5 sm:grid-cols-4">{[["金額", formatExpenseAmount(value.amount, value.currency)],["類別", value.category],["下次執行", value.next_run_date],["最近產生", value.last_generated_for ?? "—"],["開始", value.start_date],["結束", value.end_date ?? "無"],["付款方式", value.payment_method ?? "—"],["時區", value.timezone]].map(([label, text]) => <p key={label}><span className="block text-sm text-slate-500">{label}</span>{text}</p>)}</section>
    <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">規則操作</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">
      {value.is_active ? <form action={pauseRecurringAction.bind(null, id)}><button className="min-h-11 w-full rounded-xl border border-amber-300 px-4 font-semibold text-amber-800">暫停</button></form> : !value.cancelled_at && <form action={resumeRecurringAction.bind(null, id)}><button className="min-h-11 w-full rounded-xl border border-emerald-300 px-4 font-semibold text-emerald-800">恢復（不補暫停月份）</button></form>}
      {!value.cancelled_at && <form action={cancelRecurringAction.bind(null, id)}><button className="min-h-11 w-full rounded-xl border border-red-300 px-4 font-semibold text-red-700">取消規則</button></form>}
    </div></section>
    <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">立即建立一次</h2><p className="mt-2 text-sm text-slate-500">「計入本期」同月只能有一筆；「額外建立」不影響正常排程。</p><form action={generateRecurringNowAction.bind(null, id)} className="mt-4 flex flex-col gap-3 sm:flex-row"><button className="min-h-11 flex-1 rounded-xl bg-indigo-600 px-4 font-semibold text-white" name="mode" value="current_period">計入本期</button><button className="min-h-11 flex-1 rounded-xl border border-indigo-200 px-4 font-semibold text-indigo-700" name="mode" value="extra">額外建立一次</button></form></section>
    <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">已產生紀錄</h2>{history.error ? <p className="mt-3 text-red-600">{history.error}</p> : history.data.length === 0 ? <p className="mt-3 text-slate-500">尚未產生消費。</p> : <ul className="mt-3 divide-y divide-slate-100">{history.data.map((expense) => <li key={expense.id}><Link className="flex justify-between gap-4 py-3" href={`/expenses/${expense.id}`}><span>{expense.expense_date} · {expense.category}</span><strong>{formatExpenseAmount(expense.amount, expense.currency)}</strong></Link></li>)}</ul>}</section>
    <section className="rounded-3xl border border-red-300 bg-red-50 p-5"><h2 className="font-bold text-red-800">刪除規則</h2><p className="mt-2 text-sm text-red-700">歷史 expense 會保留。請輸入 DELETE 確認。</p><form action={deleteRecurringAction.bind(null, id)} className="mt-3 flex gap-3"><input aria-label="刪除確認" className="min-h-11 min-w-0 flex-1 rounded-xl border px-3" name="confirm" placeholder="DELETE" /><button className="rounded-xl border border-red-300 px-4 font-semibold text-red-700">刪除</button></form></section>
  </div></main>;
}

