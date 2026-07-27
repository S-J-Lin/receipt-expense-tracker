"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { berlinDate, formDataToRecurring } from "@/lib/recurring-expenses";
import { createSupabaseClient } from "@/lib/supabase/client";
import type { RecurringExpenseInsert } from "@/types/recurring-expense";

export type RecurringActionState = { message: string; errors?: Record<string, string[]> };
const validId = z.string().uuid();

function validationState(result: ReturnType<typeof formDataToRecurring>): RecurringActionState {
  return { message: "請修正表單中的錯誤。", errors: result.success ? undefined : result.error.flatten().fieldErrors };
}

export async function createRecurringAction(_state: RecurringActionState, formData: FormData): Promise<RecurringActionState> {
  const parsed = formDataToRecurring(formData);
  if (!parsed.success) return validationState(parsed);
  const { error } = await createSupabaseClient().from("recurring_expenses").insert({ ...parsed.data, recurrence_type: "monthly" });
  if (error) return { message: `新增失敗：${error.message}` };
  revalidatePath("/recurring"); redirect("/recurring?success=created");
}

export async function updateRecurringAction(id: string, _state: RecurringActionState, formData: FormData): Promise<RecurringActionState> {
  const parsedId = validId.safeParse(id); const parsed = formDataToRecurring(formData);
  if (!parsedId.success) return { message: "固定支出 ID 無效。" };
  if (!parsed.success) return validationState(parsed);
  const supabase = createSupabaseClient();
  const existing = await supabase.from("recurring_expenses").select("cancelled_at").eq("id", parsedId.data).maybeSingle();
  if (existing.error || !existing.data) return { message: "找不到固定支出規則。" };
  if (existing.data.cancelled_at && parsed.data.is_active) return { message: "已取消的規則不能恢復；請建立新規則。" };
  const shouldResume = parsed.data.is_active;
  const { error } = await supabase.from("recurring_expenses").update({ ...parsed.data, is_active: false }).eq("id", parsedId.data);
  if (error) return { message: `更新失敗：${error.message}` };
  if (shouldResume) {
    const resumed = await supabase.rpc("resume_recurring_expense", { p_id: parsedId.data, p_today: berlinDate() });
    if (resumed.error) return { message: `設定已更新，但重新計算下次日期失敗：${resumed.error.message}` };
  }
  revalidatePath("/recurring"); revalidatePath(`/recurring/${id}`); redirect(`/recurring/${id}?success=updated`);
}

async function setRule(id: string, values: Partial<RecurringExpenseInsert>, success: string) {
  const parsed = validId.safeParse(id); if (!parsed.success) redirect("/recurring?error=invalid-id");
  const { error } = await createSupabaseClient().from("recurring_expenses").update(values).eq("id", parsed.data);
  revalidatePath("/recurring"); revalidatePath(`/recurring/${id}`);
  redirect(`/recurring/${id}?${error ? "error=action-failed" : `success=${success}`}`);
}

export async function pauseRecurringAction(id: string) { await setRule(id, { is_active: false }, "paused"); }
export async function cancelRecurringAction(id: string) { await setRule(id, { is_active: false, cancelled_at: new Date().toISOString() }, "cancelled"); }

export async function resumeRecurringAction(id: string) {
  const parsed = validId.safeParse(id); if (!parsed.success) redirect("/recurring?error=invalid-id");
  const { error } = await createSupabaseClient().rpc("resume_recurring_expense", { p_id: parsed.data, p_today: berlinDate() });
  revalidatePath("/recurring"); revalidatePath(`/recurring/${id}`);
  redirect(`/recurring/${id}?${error ? "error=resume-failed" : "success=resumed"}`);
}

export async function generateRecurringNowAction(id: string, formData: FormData) {
  const parsed = validId.safeParse(id); const mode = z.enum(["current_period", "extra"]).safeParse(formData.get("mode"));
  if (!parsed.success || !mode.success) redirect(`/recurring/${id}?error=invalid-generation`);
  const { data, error } = await createSupabaseClient().rpc("generate_recurring_expense_now", { p_id: parsed.data, p_mode: mode.data, p_today: berlinDate() });
  revalidatePath("/"); revalidatePath("/expenses"); revalidatePath(`/recurring/${id}`);
  redirect(error || !data ? `/recurring/${id}?error=generation-failed` : `/expenses/${data}?success=recurring-generated`);
}

export async function deleteRecurringAction(id: string, formData: FormData) {
  const parsed = validId.safeParse(id);
  if (!parsed.success || formData.get("confirm") !== "DELETE") redirect(`/recurring/${id}?error=delete-confirmation`);
  const { error } = await createSupabaseClient().from("recurring_expenses").delete().eq("id", parsed.data);
  revalidatePath("/recurring"); redirect(error ? `/recurring/${id}?error=delete-failed` : "/recurring?success=deleted");
}
