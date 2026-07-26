const messages: Record<string, string> = {
  created: "消費已成功新增。",
  updated: "消費已成功更新。",
  deleted: "消費已成功刪除。",
  "receipt-cancelled": "已取消收據確認並刪除暫存檔案。",
  imported: "ChatGPT 匯入已成功儲存。",
};

export function Notice({ success, error, warning }: { success?: string; error?: string; warning?: string }) {
  const warningNotice = warning === "receipt-cleanup-failed" ? (
    <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900" role="status">資料已完成更新，但舊收據檔案未能自動清理。請稍後至 Supabase Storage 檢查 orphan 檔案。</p>
  ) : null;
  if (success && messages[success]) {
    return <div className="space-y-3"><p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800" role="status">{messages[success]}</p>{warningNotice}</div>;
  }
  if (error) {
    const message = error === "delete-failed" ? "刪除失敗，請稍後再試。" : "操作失敗，請稍後再試。";
    return <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800" role="alert">{message}</p>;
  }
  return null;
}
