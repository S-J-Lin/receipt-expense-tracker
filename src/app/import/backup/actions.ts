"use server";

import { gunzipSync } from "node:zlib";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthorizedUser } from "@/lib/auth";
import { BACKUP_MAX_BYTES, buildRestorePreview, isPartialBackup, parseBackupText, RESTORE_MODES, restorePayloadHash, type ReceiptTrackerBackup, type RestoreMode, type RestorePreview } from "@/lib/backup-restore";
import type { BackupTransport } from "@/lib/backup-transport";
import { isMissingFunction, logDbError, toUserMessage } from "@/lib/errors";
import { getExpenses } from "@/lib/expenses";
import { fetchAllProductAliases } from "@/lib/items";
import { localIsoDate } from "@/lib/local-date";
import { fetchAllRecurringExpenses } from "@/lib/recurring-expense-data";
import { errorMessage } from "@/lib/supabase/fetch-all";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type RestoreReport = {
  imported_expenses: number; imported_items: number; imported_adjustments: number; imported_aliases: number;
  skipped_duplicates: number; merged_records: number; conflicts: number; missing_attachments: string[];
  duration_ms: number; restore_mode: RestoreMode; restore_key: string;
  imported_recurring_expenses?: number; skipped_recurring_expenses?: number; merged_recurring_expenses?: number;
  advanced_recurring_rules?: number; recurring_links_restored?: number; recurring_links_dropped?: number;
  atomic?: boolean; replayed?: boolean;
};
export type BackupPreviewResult = { error: string | null; warnings?: string[]; preview?: RestorePreview };
export type BackupRestoreResult = { error: string | null; report?: RestoreReport; retryable?: boolean };

const RESTORE_MIGRATION = "supabase/migrations/20261008000100_atomic_restore_v2.sql";

function decodeTransport(payload: unknown): { text: string | null; error: string | null } {
  const transport = payload as Partial<BackupTransport> | null;
  if (!transport || typeof transport !== "object" || typeof transport.data !== "string") return { text: null, error: "備份資料格式無效。" };
  if (transport.encoding === "json") return { text: transport.data, error: null };
  if (transport.encoding !== "gzip-base64") return { text: null, error: "備份資料格式無效。" };
  try {
    // maxOutputLength caps decompression, so a small upload cannot expand without limit.
    return { text: gunzipSync(Buffer.from(transport.data, "base64"), { maxOutputLength: BACKUP_MAX_BYTES + 1 }).toString("utf8"), error: null };
  } catch {
    return { text: null, error: "無法解壓縮備份，或備份超過 25 MB。" };
  }
}

function validateBackup(payload: unknown): { data: ReceiptTrackerBackup | null; error: string | null; warnings: string[] } {
  const decoded = decodeTransport(payload);
  if (decoded.text === null) return { data: null, error: decoded.error, warnings: [] };
  const parsed = parseBackupText(decoded.text);
  return parsed.data ? { data: parsed.data, error: null, warnings: parsed.warnings } : { data: null, error: parsed.errors.join("；"), warnings: [] };
}

/** Lists each receipt folder once (instead of one Storage request per file). */
async function findMissingAttachments(backup: ReceiptTrackerBackup): Promise<string[]> {
  const paths = [...new Set(backup.expenses.map((expense) => expense.receipt_image_path).filter((value): value is string => Boolean(value)))];
  if (paths.length === 0) return [];
  const storage = (await createServerSupabaseClient()).storage.from("receipts");
  const byFolder = new Map<string, Set<string>>();
  for (const path of paths) {
    const parts = path.split("/");
    const file = parts.pop() ?? "";
    const folder = parts.join("/");
    const files = byFolder.get(folder);
    if (files) files.add(file); else byFolder.set(folder, new Set([file]));
  }
  const missing: string[] = [];
  for (const [folder, files] of byFolder) {
    const present = new Set<string>();
    let failed = false;
    for (let offset = 0; offset < 100_000; offset += 1000) {
      const { data, error } = await storage.list(folder, { limit: 1000, offset });
      if (error) { failed = true; break; }
      for (const entry of data) present.add(entry.name);
      if (data.length < 1000) break;
    }
    for (const file of files) if (failed || !present.has(file)) missing.push(`${folder}/${file}`);
  }
  return missing;
}

export async function previewBackupAction(payload: unknown): Promise<BackupPreviewResult> {
  await requireAuthorizedUser();
  const valid = validateBackup(payload);
  if (!valid.data) return { error: valid.error };
  try {
    const [expenses, aliases, rules, missing] = await Promise.all([
      getExpenses(),
      fetchAllProductAliases(),
      fetchAllRecurringExpenses(),
      findMissingAttachments(valid.data),
    ]);
    if (!expenses.data) return { error: expenses.error };
    return { error: null, warnings: valid.warnings, preview: buildRestorePreview(valid.data, expenses.data, aliases, missing, { existingRecurringIds: rules.map((rule) => rule.id), existingRecurringCount: rules.length, today: localIsoDate() }) };
  } catch (error) {
    return { error: errorMessage(error, "無法建立還原預覽。") };
  }
}

/**
 * Restores a validated backup in one database transaction
 * (restore_receipt_tracker_backup_v2). The restore key is bound to the
 * payload hash and mode on the server, so a reused key for a different file
 * or mode is rejected instead of replaying an unrelated report.
 */
export async function restoreBackupAction(payload: unknown, mode: string, restoreKey: string, destructiveConfirmed: boolean, confirmationText: string): Promise<BackupRestoreResult> {
  await requireAuthorizedUser();
  const valid = validateBackup(payload);
  if (!valid.data) return { error: valid.error };
  const parsedMode = z.enum(RESTORE_MODES).safeParse(mode);
  const parsedKey = z.string().uuid().safeParse(restoreKey);
  if (!parsedMode.success || !parsedKey.success) return { error: "還原模式或識別碼無效。" };
  if (parsedMode.data === "replace" && (!destructiveConfirmed || confirmationText !== "RESTORE")) return { error: "Replace all 必須勾選確認並輸入 RESTORE。" };
  if (parsedMode.data === "replace" && isPartialBackup(valid.data)) return { error: toUserMessage({ message: "partial_backup_replace_forbidden" }) };
  try {
    const [missing, payloadHash] = await Promise.all([findMissingAttachments(valid.data), restorePayloadHash(valid.data, parsedMode.data)]);
    const { data, error } = await (await createServerSupabaseClient()).rpc("restore_receipt_tracker_backup_v2", {
      p_restore_key: parsedKey.data, p_mode: parsedMode.data, p_backup: valid.data as unknown as Record<string, unknown>,
      p_payload_hash: payloadHash, p_replace_confirmation: parsedMode.data === "replace" ? confirmationText : null,
      p_missing_attachments: missing, p_today: localIsoDate(),
    });
    if (isMissingFunction(error)) return { error: `資料庫尚未套用還原 migration（${RESTORE_MIGRATION}）。為避免非原子化還原，已停止操作；資料沒有被修改。` };
    if (error || !data) {
      logDbError("restore", error);
      return { error: `還原失敗，整個交易已回滾，原資料保持不變：${toUserMessage(error, "資料庫沒有回傳報告")}`, retryable: error?.message !== "restore_key_conflict" };
    }
    revalidatePath("/"); revalidatePath("/expenses"); revalidatePath("/items"); revalidatePath("/export"); revalidatePath("/recurring");
    return { error: null, report: data as RestoreReport };
  } catch (error) {
    return { error: `還原沒有完成，請確認網路後重試；若資料庫已完成交易，重試會回傳同一份報告：${errorMessage(error, "未知錯誤")}`, retryable: true };
  }
}
