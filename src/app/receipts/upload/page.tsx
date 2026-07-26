import Link from "next/link";
import { ReceiptUploadForm } from "@/components/receipt-upload-form";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReceiptUploadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const expenseId = single((await searchParams).expenseId);
  return (
    <main className="flex-1 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link className="text-sm font-semibold text-indigo-600 hover:text-indigo-800" href="/">← 返回首頁</Link>
        <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-indigo-600">Milestone 7</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">{expenseId ? "替換收據" : "上傳收據"}</h1>
          <p className="mt-2 text-slate-600">{expenseId ? "新檔案成功上傳及驗證後，才會替換目前收據。" : "先拍攝或選擇收據，上傳後再人工輸入消費資料。"}</p>
          <div className="mt-6"><ReceiptUploadForm expenseId={expenseId} /></div>
        </section>
      </div>
    </main>
  );
}
