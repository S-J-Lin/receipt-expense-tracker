"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { chatGPTImportSchema } from "@/lib/chatgpt-import-schema";
import { moneyToCents } from "@/lib/money";
import { normalizeProductAlias } from "@/lib/product-aliases";
import { createSupabaseClient } from "@/lib/supabase/client";
import type { ChatGPTImport } from "@/types/chatgpt-import";
import type { ExpenseCategory } from "@/types/expense";

export type ChatGPTImportActionResult = { error: string | null };

async function applyConfirmedAliases(data: ChatGPTImport): Promise<ChatGPTImport> {
  const supabase = createSupabaseClient();
  const items = await Promise.all(data.items.map(async (item) => {
    if (item.name_normalized) return item;
    const alias = await supabase.from("product_aliases").select("*")
      .eq("alias_normalized", normalizeProductAlias(item.name_original)).maybeSingle();
    if (alias.data) return { ...item, name_normalized: alias.data.normalized_name,
      brand: item.brand === "N/A" ? alias.data.brand ?? "N/A" : item.brand,
      product_group: item.product_group ?? alias.data.product_group ?? undefined };
    return { ...item, name_normalized: item.name_original, product_group: item.product_group ?? undefined };
  }));
  return { ...data, items };
}

function chooseExpenseCategory(data: ChatGPTImport): ExpenseCategory {
  if (data.category) return data.category;
  const totals = new Map<ExpenseCategory, number>();
  for (const entry of [...data.items, ...data.adjustments]) {
    totals.set(entry.category, (totals.get(entry.category) ?? 0) + moneyToCents(entry.amount));
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "其他";
}

export async function saveChatGPTImportAction(
  payload: unknown,
  idempotencyKey: string,
): Promise<ChatGPTImportActionResult> {
  const validKey = z.string().uuid().safeParse(idempotencyKey);
  if (!validKey.success) return { error: "匯入識別碼無效，請返回後重新解析。" };
  const parsed = chatGPTImportSchema.safeParse(payload);
  if (!parsed.success) return { error: `資料驗證失敗：${parsed.error.issues[0]?.message ?? "格式不正確"}` };

  try {
    const data = await applyConfirmedAliases(parsed.data);
    const { data: expenseId, error } = await createSupabaseClient().rpc("create_chatgpt_import", {
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
    if (error || !expenseId) return { error: `匯入失敗：${error?.message ?? "資料庫沒有回傳消費 ID"}` };
    revalidatePath("/");
    revalidatePath("/expenses");
    redirect(`/expenses/${expenseId}?success=imported`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "匯入時發生未知錯誤。" };
  }
}
