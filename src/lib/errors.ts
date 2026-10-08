// Maps PostgREST / PostgreSQL errors to user-facing Traditional Chinese text.
// Raw database messages can contain constraint names or input values, so they
// are not shown verbatim and are not logged; only the error code is logged.

export type DbErrorLike = { message?: string | null; code?: string | null } | null | undefined;

const KNOWN_RAISES: Record<string, string> = {
  forbidden: "沒有權限執行此操作。",
  restore_key_conflict: "這個還原識別碼已用於不同的檔案或模式。請重新選擇檔案後再還原；資料沒有被修改。",
  partial_backup_replace_forbidden: "這是篩選後的部分備份，不能用於「Replace all」。請改用 Skip 或 Merge，或匯出完整備份。",
  replace_requires_recurring_section: "這份備份沒有固定支出規則欄位（舊版格式），不能用於「Replace all」，以免刪除現有固定支出規則。",
  replace_confirmation_required: "Replace all 必須勾選確認並輸入 RESTORE。",
  duplicate_expense_id: "備份中有重複的 expense id，已拒絕還原。",
  unsupported_export_major_version: "不支援此備份版本。",
  backup_too_large: "備份檔過大。",
  forbidden_backup_field: "備份含有不允許的欄位（例如 signed URL 或內部金鑰）。",
  invalid_backup_structure: "備份結構無效。",
  recurring_rule_owner_mismatch: "固定支出規則的擁有者不一致，已拒絕還原。",
  idempotency_lookup_failed: "無法確認先前的儲存結果，請重新整理後再試。",
  recurring_rule_not_resumable: "已取消的規則不能恢復。",
  date_outside_recurring_rule: "今天不在此規則的開始與結束日期之間。",
  recurring_rule_cancelled: "此規則已取消。",
};

const CODE_MESSAGES: Record<string, string> = {
  "23505": "資料重複，違反唯一性限制。",
  "23514": "資料不符合資料庫的檢查規則（例如金額、類別或日期）。",
  "23503": "關聯的資料不存在或已被刪除。",
  "23502": "缺少必要欄位。",
  "22P02": "資料格式不正確。",
  "22003": "數值超出允許範圍。",
  "22007": "日期格式不正確。",
  "22008": "日期超出允許範圍。",
  "42501": "沒有權限執行此操作。",
  PGRST116: "找不到資料。",
  PGRST301: "登入已過期，請重新登入。",
};

/** True when the RPC does not exist yet (migration not applied). */
export function isMissingFunction(error: DbErrorLike): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "");
}

export function toUserMessage(error: DbErrorLike, fallback = "資料庫操作失敗，請稍後再試。"): string {
  if (!error) return fallback;
  const raised = (error.message ?? "").trim();
  if (KNOWN_RAISES[raised]) return KNOWN_RAISES[raised];
  if (error.code && CODE_MESSAGES[error.code]) return CODE_MESSAGES[error.code];
  if (/fetch failed|network|timeout/i.test(raised)) return "無法連線到資料庫，請確認網路後再試。";
  return error.code ? `${fallback}（代碼 ${error.code}）` : fallback;
}

/** Logs only a context label and the error code — never payloads or raw messages. */
export function logDbError(context: string, error: DbErrorLike): void {
  if (!error) return;
  console.error(`[receipt-tracker] ${context} failed`, { code: error.code ?? "unknown" });
}
