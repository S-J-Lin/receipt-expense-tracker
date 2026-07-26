import Link from "next/link";

export default function ReceiptSessionNotFound() {
  return <main className="flex-1 px-4 py-12"><section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-bold">找不到收據確認工作階段</h1><p className="mt-3 text-slate-600">連結可能無效、工作階段已刪除，或你正在使用不同的瀏覽器。</p><Link className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white" href="/receipts/upload">重新上傳收據</Link></section></main>;
}
