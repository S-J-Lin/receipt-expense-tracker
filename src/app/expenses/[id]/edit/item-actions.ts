"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuthorizedUser } from "@/lib/auth";
import { itemizedExpenseEditSchema } from "@/lib/itemized-expense-schema";
import { logDbError, toUserMessage } from "@/lib/errors";
import { aliasNeedsConfirmation, normalizeProductAlias } from "@/lib/product-aliases";
import { chunk } from "@/lib/supabase/fetch-all";
import type { ProductAlias } from "@/types/expense";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ItemizedEditResult = {
  error: string | null;
  aliasConflicts?: string[];
  mainSaved?: boolean;
};

export async function saveItemizedExpenseAction(
  expenseId: string,
  payload: unknown,
  idempotencyKey: string,
): Promise<ItemizedEditResult> {
  await requireAuthorizedUser();
  const validId = z.string().uuid().safeParse(expenseId);
  const validKey = z.string().uuid().safeParse(idempotencyKey);
  const parsed = itemizedExpenseEditSchema.safeParse(payload);
  if (!validId.success || !validKey.success) return { error: "消費或儲存識別碼無效。" };
  if (!parsed.success) return { error: `資料驗證失敗：${parsed.error.issues[0]?.message ?? "格式錯誤"}` };
  const data = parsed.data;
  const supabase = (await createServerSupabaseClient());
  const { error } = await supabase.rpc("update_itemized_expense", {
    p_expense_id: validId.data, p_idempotency_key: validKey.data,
    p_merchant: data.merchant, p_expense_date: data.expense_date,
    p_currency: data.currency, p_total_amount: data.total_amount,
    p_category: data.category, p_payment_method: data.payment_method || null,
    p_notes: data.notes || null, p_items: data.items, p_adjustments: data.adjustments,
  });
  if (error) { logDbError("update itemized expense", error); return { error: `明細儲存失敗：${toUserMessage(error)}` }; }

  const conflicts: string[] = [];
  let aliasFailed = false;
  // One batched lookup for all aliases instead of one query per alias.
  const existingByKey = new Map<string, ProductAlias>();
  const keys = [...new Set(data.aliases.map((alias) => normalizeProductAlias(alias.alias)))];
  for (const part of chunk(keys)) {
    const lookup = await supabase.from("product_aliases").select("*").in("alias_normalized", part);
    if (lookup.error) { aliasFailed = true; logDbError("alias lookup", lookup.error); continue; }
    for (const row of (lookup.data ?? []) as ProductAlias[]) existingByKey.set(row.alias_normalized, row);
  }
  for (const alias of data.aliases) {
    const existing = existingByKey.get(normalizeProductAlias(alias.alias));
    if (existing && aliasNeedsConfirmation(existing.normalized_name, alias.normalized_name) && !alias.overwrite) {
      conflicts.push(`${alias.alias}：目前對應「${existing.normalized_name}」`);
      continue;
    }
    const values = { alias: alias.alias, normalized_name: alias.normalized_name,
      product_group: alias.product_group || null, category: alias.category,
      brand: alias.brand || "N/A" };
    const mutation = existing
      ? await supabase.from("product_aliases").update(values).eq("id", existing.id)
      : await supabase.from("product_aliases").insert(values);
    if (mutation.error) { aliasFailed = true; logDbError("alias save", mutation.error); }
  }
  if (conflicts.length) return { error: null, aliasConflicts: conflicts, mainSaved: true };
  revalidatePath("/"); revalidatePath("/expenses"); revalidatePath("/items");
  revalidatePath(`/expenses/${validId.data}`);
  redirect(`/expenses/${validId.data}?success=updated${aliasFailed ? "&warning=alias-failed" : data.aliases.length ? "&warning=alias-saved" : ""}`);
}
