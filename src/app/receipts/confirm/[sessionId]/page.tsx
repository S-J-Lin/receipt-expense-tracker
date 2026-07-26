import Link from "next/link";
import { notFound } from "next/navigation";
import { confirmReceiptSessionAction, cancelReceiptSessionAction } from "@/app/receipts/confirm/[sessionId]/actions";
import { CancelReceiptSessionButton } from "@/components/cancel-receipt-session-button";
import { ExpenseForm } from "@/components/expense-form";
import { getReceiptUploadSession } from "@/lib/receipt-sessions";
import { createReceiptSignedUrl } from "@/lib/receipt-storage";
import { receiptKindFromPath } from "@/lib/receipt-validation";

function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function ReceiptConfirmationPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { sessionId } = await params;
  const sessionResult = await getReceiptUploadSession(sessionId);
  if (!sessionResult.data) notFound();
  const session = sessionResult.data;
  const query = await searchParams;
  const errorCode = single(query.error);
  const warning = single(query.warning);
  const unavailable = sessionResult.error || session.status !== "pending";
  const receiptUrl = await createReceiptSignedUrl(session.receipt_image_path);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  const confirmAction = confirmReceiptSessionAction.bind(null, sessionId);
  const cancelAction = cancelReceiptSessionAction.bind(null, sessionId);

  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-2xl">
    <Link className="text-sm font-semibold text-indigo-600 hover:text-indigo-800" href="/">← 返回首頁</Link>
    <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <p className="text-sm font-semibold text-indigo-600">Milestone 8</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-950">確認收據與消費資料</h1>
      <p className="mt-2 text-slate-600">人工核對並填寫欄位。按下確認後，收據與一筆消費會以同一個資料庫交易完成關聯。</p>
      {warning === "receipt-cleanup-failed" && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">新收據已替換，但舊暫存檔案未能清理，請稍後檢查 Storage。</p>}
      {errorCode && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{errorCode === "cleanup-failed" ? "Storage 暫存檔案刪除失敗，因此尚未取消。請稍後再試。" : "無法取消此工作階段，請重新整理後再試。"}</p>}
      {unavailable ? <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900"><p className="font-semibold">此確認頁目前不可使用</p><p className="mt-1 text-sm">{sessionResult.error ?? `工作階段狀態：${session.status}`}</p></div> : <>
        <div className="mt-6"><ExpenseForm action={confirmAction} initialValues={{ merchant: session.merchant ?? "", expense_date: session.expense_date ?? today, amount: session.amount?.toFixed(2) ?? "", currency: session.currency ?? "EUR", category: session.category ?? "其他", payment_method: session.payment_method ?? "", notes: session.notes ?? "" }} receiptKind={receiptKindFromPath(session.receipt_image_path)} receiptUrl={receiptUrl} sessionId={sessionId} submitLabel="確認並建立消費" today={today} /></div>
        <div className="mt-4"><CancelReceiptSessionButton action={cancelAction} /></div>
      </>}
    </section>
  </div></main>;
}
