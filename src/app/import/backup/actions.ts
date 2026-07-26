"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildRestorePreview, parseBackupText, RESTORE_MODES, type ReceiptTrackerBackup, type RestoreMode, type RestorePreview } from "@/lib/backup-restore";
import { getExpenses } from "@/lib/expenses";
import { createSupabaseClient } from "@/lib/supabase/client";
import type { ProductAlias } from "@/types/expense";

export type RestoreReport = {
  imported_expenses: number; imported_items: number; imported_adjustments: number; imported_aliases: number;
  skipped_duplicates: number; merged_records: number; conflicts: number; missing_attachments: string[];
  duration_ms: number; restore_mode: RestoreMode; restore_key: string;
};
export type BackupPreviewResult = { error: string | null; warnings?: string[]; preview?: RestorePreview };
export type BackupRestoreResult = { error: string | null; report?: RestoreReport };

function validateBackup(payload: unknown): { data: ReceiptTrackerBackup | null; error: string | null; warnings: string[] } {
  const parsed = parseBackupText(JSON.stringify(payload));
  return parsed.data ? { data: parsed.data, error: null, warnings: parsed.warnings } : { data: null, error: parsed.errors.join("；"), warnings: [] };
}

async function findMissingAttachments(backup: ReceiptTrackerBackup): Promise<string[]> {
  const paths = [...new Set(backup.expenses.map((expense) => expense.receipt_image_path).filter((value): value is string => Boolean(value)))];
  const storage = createSupabaseClient().storage.from("receipts");
  const missing: string[] = [];
  for (const path of paths) {
    const parts = path.split("/");
    const filename = parts.pop() ?? "";
    const { data, error } = await storage.list(parts.join("/"), { limit: 2, search: filename });
    if (error || !data.some((entry) => entry.name === filename)) missing.push(path);
  }
  return missing;
}

export async function previewBackupAction(payload: unknown): Promise<BackupPreviewResult> {
  const valid = validateBackup(payload);
  if (!valid.data) return { error: valid.error };
  const supabase = createSupabaseClient();
  const [expenses, aliases, missing] = await Promise.all([
    getExpenses(),
    supabase.from("product_aliases").select("*").order("alias_normalized"),
    findMissingAttachments(valid.data),
  ]);
  if (!expenses.data) return { error: expenses.error };
  if (aliases.error) return { error: `無法讀取現有 aliases：${aliases.error.message}` };
  return { error: null, warnings: valid.warnings, preview: buildRestorePreview(valid.data, expenses.data, aliases.data as ProductAlias[], missing) };
}

export async function restoreBackupAction(payload: unknown, mode: string, restoreKey: string, destructiveConfirmed: boolean, confirmationText: string): Promise<BackupRestoreResult> {
  const valid = validateBackup(payload);
  if (!valid.data) return { error: valid.error };
  const parsedMode = z.enum(RESTORE_MODES).safeParse(mode);
  const parsedKey = z.string().uuid().safeParse(restoreKey);
  if (!parsedMode.success || !parsedKey.success) return { error: "還原模式或識別碼無效。" };
  if (parsedMode.data === "replace" && (!destructiveConfirmed || confirmationText !== "RESTORE")) return { error: "Replace all 必須勾選確認並輸入 RESTORE。" };
  const missing = await findMissingAttachments(valid.data);
  const { data, error } = await createSupabaseClient().rpc("restore_receipt_tracker_backup", {
    p_restore_key: parsedKey.data, p_mode: parsedMode.data, p_backup: valid.data,
    p_replace_confirmation: parsedMode.data === "replace" ? confirmationText : null,
    p_missing_attachments: missing,
  });
  if (error || !data) return { error: `還原失敗，原資料保持不變：${error?.message ?? "資料庫沒有回傳報告"}` };
  revalidatePath("/"); revalidatePath("/expenses"); revalidatePath("/items"); revalidatePath("/export");
  return { error: null, report: data as RestoreReport };
}
