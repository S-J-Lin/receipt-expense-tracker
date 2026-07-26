"use client";

import Link from "next/link";
import { ReceiptPreview } from "@/components/receipt-preview";

type Props = {
  currentKind?: "image" | "pdf" | "heic";
  currentUrl?: string | null;
  expenseId?: string;
  sessionId?: string;
};

export function ReceiptAttachmentField({ currentKind, currentUrl, expenseId, sessionId }: Props) {
  const uploadHref = expenseId ? `/receipts/upload?expenseId=${expenseId}` : sessionId ? `/receipts/upload?sessionId=${sessionId}` : "/receipts/upload";
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div><p className="font-medium text-slate-800">收據附件</p><p className="mt-1 text-sm text-slate-600">{currentUrl ? "目前收據如下。" : "目前沒有收據附件。"}</p></div>
      {currentUrl && currentKind && <ReceiptPreview kind={currentKind} name="目前" url={currentUrl} />}
      <Link className="inline-flex min-h-11 items-center rounded-xl border border-indigo-200 bg-white px-4 font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2" href={uploadHref}>
        {currentUrl ? "重新上傳收據" : "上傳收據"}
      </Link>
    </section>
  );
}
