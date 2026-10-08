"use client";

import Link from "next/link";

export default function ErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16"><section aria-labelledby="error-title" className="ui-card w-full text-center" role="alert"><h1 className="text-2xl font-bold" id="error-title">暫時無法載入資料</h1><p className="mt-3 ui-muted">請確認網路連線後重試。表單中尚未儲存的內容不會被送出。</p>{error.digest && <p className="mt-2 text-xs ui-muted">錯誤代碼：{error.digest}</p>}<div className="mt-6 flex flex-col gap-3 sm:flex-row"><button className="ui-btn ui-btn-primary flex-1" onClick={() => unstable_retry()} type="button">重試</button><Link className="ui-btn ui-btn-secondary flex-1" href="/">返回首頁</Link></div></section></main>;
}
