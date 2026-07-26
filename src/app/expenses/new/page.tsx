import Link from "next/link";
import { createExpenseAction } from "@/app/actions";
import { ExpenseForm } from "@/components/expense-form";
import { isValidReceiptPath, receiptKindFromPath } from "@/lib/receipt-validation";
import { createReceiptSignedUrl } from "@/lib/receipt-storage";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const candidatePath = single(query.receiptPath);
  const receiptPath = isValidReceiptPath(candidatePath) ? candidatePath : null;
  const receiptUrl = receiptPath ? await createReceiptSignedUrl(receiptPath) : null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  return (
    <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-2xl">
      <Link className="text-sm font-semibold text-indigo-600" href="/">← 返回首頁</Link>
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-950">新增消費</h1><p className="mt-2 text-slate-600">人工輸入資料；這個 milestone 不會辨識收據內容。</p>
        {single(query.receipt) === "uploaded" && receiptPath && <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800" role="status">收據已成功上傳，請完成消費資料。</p>}
        {candidatePath && !receiptPath && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">收據路徑無效，未附加任何檔案。</p>}
        <div className="mt-6"><ExpenseForm action={createExpenseAction} receiptKind={receiptPath ? receiptKindFromPath(receiptPath) : undefined} receiptPath={receiptPath} receiptUrl={receiptUrl} submitLabel="儲存消費" today={today} /></div>
      </section>
    </div></main>
  );
}
