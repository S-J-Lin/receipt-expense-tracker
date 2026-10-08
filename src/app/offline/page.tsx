import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "離線" };

export default function OfflinePage() {
  return <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16"><section className="ui-card w-full text-center"><p aria-hidden className="text-5xl">⌁</p><h1 className="mt-4 text-2xl font-bold">目前沒有網路連線</h1><p className="mt-3 ui-muted">Receipt Tracker 需要網路才能讀取或儲存資料；為保護隱私，帳本不會離線快取。已填寫的表單請保留在原畫面，恢復網路後再送出。</p><Link className="ui-btn ui-btn-primary mt-6" href="/">重新嘗試</Link></section></main>;
}
