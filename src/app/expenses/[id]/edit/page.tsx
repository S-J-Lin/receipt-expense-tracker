import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemizedExpenseEditor } from "@/components/itemized-expense-editor";
import { ReceiptAttachmentField } from "@/components/receipt-attachment-field";
import { getExpense } from "@/lib/expenses";
import { getProductAliases } from "@/lib/items";
import { receiptKindFromPath } from "@/lib/receipt-validation";
import { createReceiptSignedUrl } from "@/lib/receipt-storage";

export const dynamic = "force-dynamic";

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getExpense(id);
  if (!result.data && result.error === "找不到這筆消費紀錄。") notFound();
  if (!result.data) return <main className="p-6"><p className="mx-auto max-w-2xl rounded-2xl bg-red-50 p-4 text-red-800" role="alert">{result.error}</p></main>;
  const receiptUrl = result.data.receipt_image_path
    ? await createReceiptSignedUrl(result.data.receipt_image_path)
    : result.data.receipt_image_url;
  const aliases = await getProductAliases();
  return (
    <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-2xl">
      <Link className="text-sm font-semibold text-indigo-600" href={`/expenses/${result.data.id}`}>← 返回詳細資料</Link>
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"><h1 className="text-2xl font-bold text-slate-950">編輯消費與商品</h1><p className="mt-2 text-slate-600">基本資料、商品與調整項會在同一個資料庫交易中更新。</p>{aliases.error && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">目前無法讀取別名建議；仍可編輯主要資料。</p>}<div className="mt-6"><ItemizedExpenseEditor aliases={aliases.data} expense={result.data} /><div className="mt-6 border-t border-slate-200 pt-6"><ReceiptAttachmentField currentKind={result.data.receipt_image_path ? receiptKindFromPath(result.data.receipt_image_path) : receiptUrl ? "image" : undefined} currentUrl={receiptUrl} expenseId={result.data.id} /></div></div></section>
    </div></main>
  );
}
