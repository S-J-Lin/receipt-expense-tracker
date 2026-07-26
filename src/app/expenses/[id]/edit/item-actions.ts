"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { itemizedExpenseEditSchema } from "@/lib/itemized-expense-schema";
import { aliasNeedsConfirmation, normalizeProductAlias } from "@/lib/product-aliases";
import { createSupabaseClient } from "@/lib/supabase/client";

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
  const validId = z.string().uuid().safeParse(expenseId);
  const validKey = z.string().uuid().safeParse(idempotencyKey);
  const parsed = itemizedExpenseEditSchema.safeParse(payload);
  if (!validId.success || !validKey.success) return { error: "消費或儲存識別碼無效。" };
  if (!parsed.success) return { error: `資料驗證失敗：${parsed.error.issues[0]?.message ?? "格式錯誤"}` };
  const data = parsed.data;
  const supabase = createSupabaseClient();
  const { error } = await supabase.rpc("update_itemized_expense", {
    p_expense_id: validId.data, p_idempotency_key: validKey.data,
    p_merchant: data.merchant, p_expense_date: data.expense_date,
    p_currency: data.currency, p_total_amount: data.total_amount,
    p_category: data.category, p_payment_method: data.payment_method || null,
    p_notes: data.notes || null, p_items: data.items, p_adjustments: data.adjustments,
  });
  if (error) return { error: `明細儲存失敗：${error.message}` };

  const conflicts: string[] = [];
  let aliasFailed = false;
  for (const alias of data.aliases) {
    const normalized = normalizeProductAlias(alias.alias);
    const existing = await supabase.from("product_aliases").select("*").eq("alias_normalized", normalized).maybeSingle();
    if (existing.error) { aliasFailed = true; continue; }
    if (existing.data && aliasNeedsConfirmation(existing.data.normalized_name, alias.normalized_name) && !alias.overwrite) {
      conflicts.push(`${alias.alias}：目前對應「${existing.data.normalized_name}」`);
      continue;
    }
    const values = { alias: alias.alias, normalized_name: alias.normalized_name,
      product_group: alias.product_group || null, category: alias.category,
      brand: alias.brand || "N/A" };
    const mutation = existing.data
      ? await supabase.from("product_aliases").update(values).eq("id", existing.data.id)
      : await supabase.from("product_aliases").insert(values);
    if (mutation.error) aliasFailed = true;
  }
  if (conflicts.length) return { error: null, aliasConflicts: conflicts, mainSaved: true };
  revalidatePath("/"); revalidatePath("/expenses"); revalidatePath("/items");
  revalidatePath(`/expenses/${validId.data}`);
  redirect(`/expenses/${validId.data}?success=updated${aliasFailed ? "&warning=alias-failed" : data.aliases.length ? "&warning=alias-saved" : ""}`);
}
