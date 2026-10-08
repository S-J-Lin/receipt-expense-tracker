import Link from "next/link";

export default function NotFound() {
  return <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16"><section className="ui-card w-full text-center"><p className="text-sm font-bold text-indigo-700">404</p><h1 className="mt-2 text-2xl font-bold">找不到這個頁面</h1><p className="mt-3 ui-muted">紀錄可能已被刪除，或網址已變更。</p><Link className="ui-btn ui-btn-primary mt-6" href="/">返回首頁</Link></section></main>;
}
