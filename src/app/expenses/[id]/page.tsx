import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteExpenseAction } from "@/app/actions";
import { DeleteExpenseButton } from "@/components/delete-expense-button";
import { Notice } from "@/components/notice";
import { ReceiptPreview } from "@/components/receipt-preview";
import { getExpense } from "@/lib/expenses";
import { formatExpenseAmount } from "@/lib/money";
import { receiptKindFromPath } from "@/lib/receipt-validation";
import { createReceiptSignedUrl } from "@/lib/receipt-storage";
import { itemBrand, itemProductGroup, optionalItemText } from "@/lib/item-display";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "消費詳細資料" };
function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function ExpenseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const result = await getExpense(id);
  if (!result.data && result.error === "找不到這筆消費紀錄。") notFound();
  if (!result.data) return <main className="flex-1 px-4 py-6"><div className="mx-auto max-w-2xl space-y-3"><p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{result.error}</p><Link className="ui-link" href="/expenses">← 返回消費紀錄</Link></div></main>;
  const expense = result.data;
  const receiptUrl = expense.receipt_image_path
    ? await createReceiptSignedUrl(expense.receipt_image_path)
    : expense.receipt_image_url;
  const deleteAction = deleteExpenseAction.bind(null, expense.id);
  const details = [
    ["日期", expense.expense_date], ["類別", expense.category], ["幣別", expense.currency],
    ["付款方式", expense.payment_method || "—"], ["來源", expense.source === "chatgpt_import" ? "ChatGPT 匯入" : expense.source === "receipt_upload" ? "收據上傳" : expense.source === "recurring" ? "固定支出" : "手動新增"], ["備註", expense.notes || "—"],
  ];
  return (
    <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-2xl space-y-4">
      <Link className="ui-link text-sm" href="/expenses">← 返回消費紀錄</Link>
      <Notice error={single(query.error)} success={single(query.success)} warning={single(query.warning)} />
      <section className="ui-card">
        <p className="text-sm font-medium text-slate-500">消費詳細資料</p><div className="mt-2 flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1"><h1 className="min-w-0 break-words text-2xl font-bold sm:text-3xl">{expense.merchant}</h1><p className="money-value shrink-0 text-2xl font-bold">{formatExpenseAmount(expense.amount, expense.currency)}</p></div>
        <dl className="mt-6 divide-y divide-slate-100">{details.map(([label, value]) => <div className="grid grid-cols-[7rem_1fr] gap-3 py-3" key={label}><dt className="text-slate-500">{label}</dt><dd className="break-words font-medium text-slate-900">{value}</dd></div>)}</dl>
        {expense.import_warnings.length > 0 && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">匯入 warnings</p><ul className="mt-2 list-disc space-y-1 pl-5">{expense.import_warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div>}
        {expense.expense_items.length > 0 && <div className="mt-6"><h2 className="text-lg font-bold">商品明細</h2><div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">{expense.expense_items.map((item) => <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3" key={item.id}><div className="min-w-0 break-words"><p className="font-medium">{item.name_normalized || item.name_original}</p>{optionalItemText(item.english_name) && <p className="text-sm text-slate-600">{optionalItemText(item.english_name)}</p>}{item.name_normalized && item.name_original && <p className="text-xs text-slate-500">{item.name_original}</p>}<p className="mt-1 text-sm text-slate-500">{itemBrand(item.brand)} · {itemProductGroup(item.product_group)} · 數量 {item.quantity}{item.unit_quantity && optionalItemText(item.unit) ? ` · ${item.unit_quantity} ${optionalItemText(item.unit)}` : ""} · {item.category}{item.confidence != null ? ` · 信心 ${Math.round(item.confidence * 100)}%` : ""}</p>{item.notes && <p className="mt-1 text-sm text-slate-600">{item.notes}</p>}</div><p className="money-value font-semibold">{formatExpenseAmount(item.amount, expense.currency)}</p></div>)}</div></div>}
        {expense.expense_adjustments.length > 0 && <div className="mt-6"><h2 className="text-lg font-bold">調整項目</h2><div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">{expense.expense_adjustments.map((item) => <div className="flex justify-between gap-3 p-3" key={item.id}><div className="min-w-0 break-words"><p className="font-medium">{item.name}</p><p className="text-sm text-slate-500">{item.category}</p></div><p className="money-value font-semibold">{formatExpenseAmount(item.amount, expense.currency)}</p></div>)}</div></div>}
        {receiptUrl && <div className="mt-5"><p className="mb-2 font-medium">收據附件</p><ReceiptPreview kind={expense.receipt_image_path ? receiptKindFromPath(expense.receipt_image_path) : "image"} name={expense.merchant} url={receiptUrl} /></div>}
        {!expense.receipt_image_path && expense.receipt_image_url && <p className="mt-2 text-xs ui-muted">這是舊版的收據連結；收據儲存空間已改為私人，舊連結可能無法開啟。</p>}
        {expense.receipt_image_path && !receiptUrl && <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">目前無法載入收據附件，請稍後重試。</p>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2"><Link className="ui-btn ui-btn-primary" href={`/expenses/${expense.id}/edit`}>編輯消費</Link><DeleteExpenseButton action={deleteAction} /></div>
      </section>
    </div></main>
  );
}
