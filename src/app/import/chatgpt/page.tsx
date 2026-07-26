import Link from "next/link";
import { ChatGPTImportForm } from "@/components/chatgpt-import-form";

export default function ChatGPTImportPage() {
  return (
    <main className="flex-1 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link className="text-sm font-semibold text-indigo-600" href="/">← 返回 Dashboard</Link>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-indigo-600">Milestone 9 · 半自動匯入</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">匯入 ChatGPT JSON</h1>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>先在專用 ChatGPT Project 中分析收據。</li>
            <li>複製 ChatGPT 產生的 JSON。</li>
            <li>貼到下方，解析並人工確認後才會儲存。</li>
          </ol>
          <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">貼上的原始文字只在此瀏覽器中解析，不會送到第三方服務。</p>
        </section>
        <ChatGPTImportForm />
      </div>
    </main>
  );
}
