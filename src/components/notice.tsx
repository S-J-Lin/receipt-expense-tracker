const messages: Record<string, string> = {
  created: "消費已成功新增。",
  updated: "消費已成功更新。",
  deleted: "消費已成功刪除。",
};

export function Notice({ success, error }: { success?: string; error?: string }) {
  if (success && messages[success]) {
    return <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800" role="status">{messages[success]}</p>;
  }
  if (error) {
    const message = error === "delete-failed" ? "刪除失敗，請稍後再試。" : "操作失敗，請稍後再試。";
    return <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800" role="alert">{message}</p>;
  }
  return null;
}
