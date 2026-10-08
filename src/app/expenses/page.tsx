import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/notice";
import { isValidMonth, listExpenses } from "@/lib/expenses";
import { formatExpenseAmount } from "@/lib/money";
import { EXPENSE_CATEGORIES } from "@/types/expense";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "消費紀錄" };
function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
const field = "mt-1 min-h-12 w-full rounded-xl border px-3";
const SOURCE_LABELS: Record<string, string> = { manual: "手動", chatgpt_import: "ChatGPT", receipt_upload: "收據", recurring: "固定支出" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const monthValue = single(params.month);
  const month = isValidMonth(monthValue) ? monthValue : undefined;
  const category = single(params.category);
  const query = single(params.query)?.trim();
  const page = Number(single(params.page) ?? "1");
  const result = await listExpenses({ month, category, query }, page);
  const pageLink = (target: number) => { const next = new URLSearchParams(); if (month) next.set("month", month); if (category) next.set("category", category); if (query) next.set("query", query); if (target > 1) next.set("page", String(target)); const text = next.toString(); return text ? `/expenses?${text}` : "/expenses"; };
  const filtered = Boolean(month || category || query);

  return (
    <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Notice error={single(params.error)} success={single(params.success)} warning={single(params.warning)} />
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3"><div className="min-w-0"><h1 className="text-2xl font-bold sm:text-3xl">消費紀錄</h1><p className="mt-1 ui-muted">搜尋、篩選與管理所有消費。</p></div><div className="flex gap-2"><Link className="ui-btn ui-btn-secondary" href="/recurring">固定支出</Link><Link className="ui-btn ui-btn-primary" href="/expenses/new">新增</Link></div></div>
      <form className="ui-card grid gap-3 sm:grid-cols-4" method="get" role="search">
        <label className="text-sm font-semibold">月份<input className={field} defaultValue={month} name="month" type="month" /></label>
        <label className="text-sm font-semibold">類別<select className={field} defaultValue={category ?? ""} name="category"><option value="">全部類別</option>{EXPENSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-sm font-semibold sm:col-span-2">搜尋店家<div className="mt-1 flex gap-2"><input className="min-h-12 min-w-0 flex-1 rounded-xl border px-3" defaultValue={query} enterKeyHint="search" name="query" placeholder="例如 REWE" type="search" /><button className="ui-btn ui-btn-primary" type="submit">搜尋</button></div></label>
      </form>
      {!result.data ? <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{result.error}</p>
        : result.data.expenses.length === 0 ? <div className="ui-card text-center"><p className="ui-muted">{filtered ? "找不到符合條件的消費。" : "還沒有任何消費紀錄。"}</p><div className="mt-4 flex flex-wrap justify-center gap-2">{filtered ? <Link className="ui-btn ui-btn-secondary" href="/expenses">清除篩選</Link> : <><Link className="ui-btn ui-btn-primary" href="/expenses/new">手動新增</Link><Link className="ui-btn ui-btn-secondary" href="/import/chatgpt">匯入 ChatGPT JSON</Link></>}</div></div>
        : <>
          <p className="text-sm ui-muted" aria-live="polite">共 {result.data.total} 筆{result.data.pageCount > 1 ? `，第 ${result.data.page} / ${result.data.pageCount} 頁` : ""}</p>
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">{result.data.expenses.map((expense) => (
            <li key={expense.id}><Link className="flex min-h-16 items-center justify-between gap-4 p-4 hover:bg-slate-50 sm:px-5" href={`/expenses/${expense.id}`}><div className="min-w-0"><p className="line-clamp-2 break-words font-semibold">{expense.merchant}{(expense.receipt_image_path || expense.receipt_image_url) && <span className="ml-2 text-sm" title="有收據附件"><span aria-hidden="true">📎</span><span className="sr-only">（有收據附件）</span></span>}</p><p className="mt-1 break-words text-sm ui-muted">{expense.expense_date} · {expense.category} · {SOURCE_LABELS[expense.source] ?? expense.source}{expense.payment_method ? ` · ${expense.payment_method}` : ""}</p></div><p className="money-value shrink-0 font-bold">{formatExpenseAmount(expense.amount, expense.currency)}</p></Link></li>
          ))}</ul>
          {result.data.pageCount > 1 && <nav aria-label="分頁" className="flex items-center justify-between gap-3">{result.data.page > 1 ? <Link className="ui-btn ui-btn-secondary" href={pageLink(result.data.page - 1)} rel="prev">← 上一頁</Link> : <span />}{result.data.page < result.data.pageCount ? <Link className="ui-btn ui-btn-secondary" href={pageLink(result.data.page + 1)} rel="next">下一頁 →</Link> : <span />}</nav>}
        </>}
    </div></main>
  );
}
