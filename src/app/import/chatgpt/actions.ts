"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuthorizedUser } from "@/lib/auth";
import { chatGPTImportSchema } from "@/lib/chatgpt-import-schema";
import { logDbError, toUserMessage } from "@/lib/errors";
import { getExpense } from "@/lib/expenses";
import { fingerprintFromPayload, fingerprintFromStored, IDEMPOTENCY_CONFLICT_MESSAGE, sameFingerprint } from "@/lib/idempotency";
import { moneyToCents } from "@/lib/money";
import { normalizeProductAlias } from "@/lib/product-aliases";
import { chunk } from "@/lib/supabase/fetch-all";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ChatGPTImport } from "@/types/chatgpt-import";
import type { ExpenseCategory, ProductAlias } from "@/types/expense";

export type ChatGPTImportActionResult = { error: string | null; conflictId?: string };

/** Applies user-confirmed aliases with one batched lookup (no per-item queries). */
async function applyConfirmedAliases(data: ChatGPTImport): Promise<ChatGPTImport> {
  const keys = [...new Set(data.items.filter((item) => !item.name_normalized).map((item) => normalizeProductAlias(item.name_original)))];
  const aliases = new Map<string, ProductAlias>();
  if (keys.length) {
    const supabase = await createServerSupabaseClient();
    for (const part of chunk(keys)) {
      const { data: rows, error } = await supabase.from("product_aliases").select("*").in("alias_normalized", part);
      if (error) { logDbError("alias lookup", error); continue; }
      for (const row of (rows ?? []) as ProductAlias[]) aliases.set(row.alias_normalized, row);
    }
  }
  return {
    ...data,
    items: data.items.map((item) => {
      if (item.name_normalized) return item;
      const alias = aliases.get(normalizeProductAlias(item.name_original));
      if (alias) return { ...item, name_normalized: alias.normalized_name, brand: item.brand === "N/A" ? alias.brand ?? "N/A" : item.brand, product_group: item.product_group ?? alias.product_group ?? undefined };
      return { ...item, name_normalized: item.name_original, product_group: item.product_group ?? undefined };
    }),
  };
}

function chooseExpenseCategory(data: ChatGPTImport): ExpenseCategory {
  if (data.category) return data.category;
  const totals = new Map<ExpenseCategory, number>();
  for (const entry of [...data.items, ...data.adjustments]) {
    totals.set(entry.category, (totals.get(entry.category) ?? 0) + moneyToCents(entry.amount));
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "其他";
}

/** Cents difference between the receipt total and items + adjustments. */
function reconciliationDifference(data: ChatGPTImport): number {
  if (data.items.length === 0 && data.adjustments.length === 0) return 0;
  const details = [...data.items, ...data.adjustments].reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  return Math.round(data.total_amount * 100) - details;
}

export async function saveChatGPTImportAction(
  payload: unknown,
  idempotencyKey: string,
  options: { reconciliationConfirmed?: boolean } = {},
): Promise<ChatGPTImportActionResult> {
  await requireAuthorizedUser();
  const validKey = z.string().uuid().safeParse(idempotencyKey);
  if (!validKey.success) return { error: "匯入識別碼無效，請返回後重新解析。" };
  const parsed = chatGPTImportSchema.safeParse(payload);
  if (!parsed.success) return { error: `資料驗證失敗：${parsed.error.issues[0]?.message ?? "格式不正確"}` };
  const difference = reconciliationDifference(parsed.data);
  // Server-side gate: a mismatch over €0.01 is never saved without explicit confirmation.
  if (Math.abs(difference) > 1 && options.reconciliationConfirmed !== true) {
    return { error: `明細合計與總金額相差 ${(difference / 100).toFixed(2)}，請勾選確認後再儲存。系統不會自動修改金額。` };
  }

  let expenseId: string;
  try {
    const data = await applyConfirmedAliases(parsed.data);
    const { data: savedId, error } = await (await createServerSupabaseClient()).rpc("create_chatgpt_import", {
      p_idempotency_key: validKey.data,
      p_merchant: data.merchant,
      p_expense_date: data.expense_date,
      p_currency: data.currency,
      p_total_amount: data.total_amount,
      p_category: chooseExpenseCategory(data),
      p_payment_method: data.payment_method ?? null,
      p_warnings: data.warnings,
      p_items: data.items,
      p_adjustments: data.adjustments,
    });
    if (error || !savedId) { logDbError("chatgpt import", error); return { error: `匯入失敗：${toUserMessage(error, "資料庫沒有回傳消費 ID")}` }; }
    expenseId = savedId;
  } catch {
    return { error: "匯入時無法連線，請確認網路後重試（重試不會重複建立）。" };
  }
  const stored = await getExpense(expenseId);
  if (stored.data && !sameFingerprint(fingerprintFromStored(stored.data), fingerprintFromPayload(parsed.data))) {
    return { error: IDEMPOTENCY_CONFLICT_MESSAGE, conflictId: expenseId };
  }
  revalidatePath("/");
  revalidatePath("/expenses");
  revalidatePath("/items");
  redirect(`/expenses/${expenseId}?success=imported`);
}
