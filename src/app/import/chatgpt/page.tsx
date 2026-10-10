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
            <li>請 ChatGPT 產生並驗證可下載的 UTF-8 JSON 檔案，下載到 iPhone「檔案」，再按「上傳 JSON 檔案」。也可以複製 JSON 貼到下方。</li>
            <li>解析後逐項確認；只有按下「確認儲存」才會寫入帳本。</li>
          </ol>
          <p className="mt-3 text-sm ui-muted">檔案與貼上的文字只在此瀏覽器中解析，不會送到第三方服務。上傳仍會驗證格式，請人工核對商品、日期及金額。</p>
        </section>
        <ChatGPTImportForm />
      </div>
    </main>
  );
}
