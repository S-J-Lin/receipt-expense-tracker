// Query-string driven status messages. Keys are specific to the record type so
// a recurring-rule action never reports「消費」and vice versa.

const SUCCESS: Record<string, string> = {
  created: "消費已成功新增。",
  updated: "消費已成功更新。",
  deleted: "消費已成功刪除。",
  imported: "ChatGPT 匯入已成功儲存。",
  "receipt-cancelled": "已取消收據確認並刪除暫存檔案。",
  "recurring-created": "固定支出規則已建立，將從下一個排程日開始自動記帳（不補建過去月份）。",
  "recurring-created-backfill": "固定支出規則已建立。已確認的過去月份會在下一次每日排程中建立（每次最多 12 筆）。",
  "recurring-updated": "固定支出規則已更新。",
  "recurring-deleted": "固定支出規則已刪除；過去產生的消費紀錄保留。",
  "recurring-paused": "固定支出規則已暫停。",
  "recurring-resumed": "固定支出規則已恢復（不補建暫停期間的月份）。",
  "recurring-cancelled": "固定支出規則已取消。",
  "recurring-generated": "已依固定支出規則建立這筆消費。",
};

const ERRORS: Record<string, string> = {
  "delete-failed": "刪除失敗，請稍後再試。",
  "invalid-id": "找不到這筆資料或網址無效。",
  "delete-confirmation": "請在確認欄輸入 DELETE 後再刪除。",
  "cancel-confirmation": "取消規則需要再次確認。",
  "extra-confirmation": "額外建立需要再次確認。",
  "resume-failed": "恢復失敗，請稍後再試。",
  "generation-failed": "建立失敗：今天可能不在規則期間內，或規則已取消。",
  "invalid-generation": "建立方式無效。",
  "action-failed": "操作失敗，請稍後再試。",
  "cancel-failed": "取消收據確認失敗，請稍後再試。",
  "cleanup-failed": "暫存收據清理失敗，請稍後再試。",
};

const WARNINGS: Record<string, { text: string; tone: "amber" | "emerald" }> = {
  "receipt-cleanup-failed": { text: "資料已完成更新，但舊收據檔案未能自動清理。請稍後至 Supabase Storage 檢查 orphan 檔案。", tone: "amber" },
  "alias-failed": { text: "消費明細已成功儲存，但部分商品別名未能儲存，請稍後重試。", tone: "amber" },
  "alias-saved": { text: "商品名稱對應已記住。", tone: "emerald" },
};

export function noticeMessage(kind: "success" | "error", key: string | undefined): string | null {
  if (!key) return null;
  return (kind === "success" ? SUCCESS : ERRORS)[key] ?? (kind === "error" ? "操作失敗，請稍後再試。" : null);
}

export function Notice({ success, error, warning }: { success?: string; error?: string; warning?: string }) {
  const successText = noticeMessage("success", success);
  const errorText = noticeMessage("error", error);
  const warningNotice = warning && WARNINGS[warning]
    ? <p className={`rounded-2xl border p-4 text-sm font-medium ${WARNINGS[warning].tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`} role="status">{WARNINGS[warning].text}</p>
    : null;
  if (!successText && !errorText && !warningNotice) return null;
  return <div className="space-y-3">
    {successText && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800" role="status">{successText}</p>}
    {errorText && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800" role="alert">{errorText}</p>}
    {warningNotice}
  </div>;
}
