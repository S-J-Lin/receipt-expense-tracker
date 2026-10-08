import Link from "next/link";
import type { Metadata } from "next";
import { ReceiptUploadForm } from "@/components/receipt-upload-form";

export const metadata: Metadata = { title: "上傳收據（實驗功能）" };

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReceiptUploadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const expenseId = single(query.expenseId);
  const sessionId = single(query.sessionId);
  const replacing = Boolean(expenseId || sessionId);
  return (
    <main className="flex-1 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link className="ui-link text-sm" href="/">← 返回首頁</Link>
        <section className="ui-card mt-4">
          <p className="text-sm font-semibold text-indigo-600">Milestone 8</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">{replacing ? "替換收據" : "上傳收據"}</h1>
          <p className="mt-2 text-slate-600">{replacing ? "新檔案成功上傳及驗證後，才會替換目前收據。" : "先拍攝或選擇收據，接著會進入專屬確認頁填寫消費資料。"}</p>
          <div className="mt-6"><ReceiptUploadForm expenseId={expenseId} sessionId={sessionId} /></div>
        </section>
      </div>
    </main>
  );
}
