import type { Metadata } from "next";
import { ChatGPTImportForm } from "@/components/chatgpt-import-form";

export const metadata: Metadata = { title: "匯入 ChatGPT JSON" };

export default function ChatGPTImportPage() {
  return (
    <main className="flex-1 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="ui-card">
          <h1 className="text-2xl font-bold">匯入 ChatGPT JSON</h1>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm ui-muted">
            <li>在專用 ChatGPT Project 中分析收據。</li>
            <li>複製 ChatGPT 產生的 JSON，貼到下方。</li>
            <li>解析後逐項確認；只有按下「確認儲存」才會寫入帳本。</li>
          </ol>
          <p className="mt-3 text-sm ui-muted">貼上的文字只在此瀏覽器中解析，不會送到第三方服務。</p>
        </section>
        <ChatGPTImportForm />
      </div>
    </main>
  );
}
