"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuthorizedUser } from "@/lib/auth";
import { logDbError, toUserMessage } from "@/lib/errors";
import { backfillPreview, berlinDate, formDataToRecurring, initialNextRunDate } from "@/lib/recurring-expenses";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { RecurringExpenseInsert } from "@/types/recurring-expense";

export type RecurringActionState = { message: string; errors?: Record<string, string[]> };
const validId = z.string().uuid();

function validationState(result: ReturnType<typeof formDataToRecurring>): RecurringActionState {
  return { message: "請修正表單中的錯誤。", errors: result.success ? undefined : result.error.flatten().fieldErrors };
}

export async function createRecurringAction(_state: RecurringActionState, formData: FormData): Promise<RecurringActionState> {
  await requireAuthorizedUser();
  const parsed = formDataToRecurring(formData);
  if (!parsed.success) return validationState(parsed);
  const { backfill, ...rule } = parsed.data;
  const today = berlinDate();
  const pastRuns = backfillPreview(rule.day_of_month, rule.start_date, today, rule.end_date);
  // A past start date never creates history unless the user explicitly confirmed the listed months.
  const doBackfill = backfill && pastRuns.length > 0 && formData.get("backfill_confirm") === "on";
  if (backfill && pastRuns.length > 0 && !doBackfill) return { message: "要補建過去月份，請勾選確認可能與手動紀錄重複。" };
  const nextRun = initialNextRunDate(rule.day_of_month, rule.start_date, today, doBackfill);
  const insert: RecurringExpenseInsert = { ...rule, recurrence_type: "monthly", next_run_date: nextRun, is_active: rule.is_active && (!rule.end_date || nextRun <= rule.end_date) };
  const { error } = await (await createServerSupabaseClient()).from("recurring_expenses").insert(insert);
  if (error) { logDbError("create recurring rule", error); return { message: `新增失敗：${toUserMessage(error)}` }; }
  revalidatePath("/recurring"); revalidatePath("/");
  redirect(`/recurring?success=${doBackfill ? "recurring-created-backfill" : "recurring-created"}`);
}

export async function updateRecurringAction(id: string, _state: RecurringActionState, formData: FormData): Promise<RecurringActionState> {
  await requireAuthorizedUser();
  const parsedId = validId.safeParse(id); const parsed = formDataToRecurring(formData);
  if (!parsedId.success) return { message: "固定支出 ID 無效。" };
  if (!parsed.success) return validationState(parsed);
  // Editing never backfills; the schedule resumes from today.
  const { backfill: _ignored, ...rule } = parsed.data; void _ignored;
  const supabase = (await createServerSupabaseClient());
  const existing = await supabase.from("recurring_expenses").select("cancelled_at").eq("id", parsedId.data).maybeSingle();
  if (existing.error || !existing.data) return { message: "找不到固定支出規則。" };
  if (existing.data.cancelled_at && rule.is_active) return { message: "已取消的規則不能恢復；請建立新規則。" };
  const shouldResume = rule.is_active;
  const { error } = await supabase.from("recurring_expenses").update({ ...rule, is_active: false }).eq("id", parsedId.data);
  if (error) { logDbError("update recurring rule", error); return { message: `更新失敗：${toUserMessage(error)}` }; }
  if (shouldResume) {
    const resumed = await supabase.rpc("resume_recurring_expense", { p_id: parsedId.data, p_today: berlinDate() });
    if (resumed.error) { logDbError("resume recurring rule", resumed.error); return { message: `設定已更新，但重新計算下次日期失敗（規則目前為暫停）：${toUserMessage(resumed.error)}` }; }
  }
  revalidatePath("/recurring"); revalidatePath(`/recurring/${id}`); revalidatePath("/");
  redirect(`/recurring/${id}?success=recurring-updated`);
}

async function setRule(id: string, values: Partial<RecurringExpenseInsert>, success: string) {
  await requireAuthorizedUser();
  const parsed = validId.safeParse(id); if (!parsed.success) redirect("/recurring?error=invalid-id");
  const { error } = await (await createServerSupabaseClient()).from("recurring_expenses").update(values).eq("id", parsed.data);
  if (error) logDbError(`recurring ${success}`, error);
  revalidatePath("/recurring"); revalidatePath(`/recurring/${id}`); revalidatePath("/");
  redirect(`/recurring/${id}?${error ? "error=action-failed" : `success=${success}`}`);
}

export async function pauseRecurringAction(id: string) { await setRule(id, { is_active: false }, "recurring-paused"); }

export async function cancelRecurringAction(id: string, formData: FormData) {
  // Cancelling is irreversible; the form must carry an explicit confirmation.
  if (formData.get("confirm_cancel") !== "yes") redirect(`/recurring/${id}?error=cancel-confirmation`);
  await setRule(id, { is_active: false, cancelled_at: new Date().toISOString() }, "recurring-cancelled");
}

export async function resumeRecurringAction(id: string) {
  await requireAuthorizedUser();
  const parsed = validId.safeParse(id); if (!parsed.success) redirect("/recurring?error=invalid-id");
  const { error } = await (await createServerSupabaseClient()).rpc("resume_recurring_expense", { p_id: parsed.data, p_today: berlinDate() });
  if (error) logDbError("resume recurring rule", error);
  revalidatePath("/recurring"); revalidatePath(`/recurring/${id}`); revalidatePath("/");
  redirect(`/recurring/${id}?${error ? "error=resume-failed" : "success=recurring-resumed"}`);
}

export async function generateRecurringNowAction(id: string, formData: FormData) {
  await requireAuthorizedUser();
  const parsed = validId.safeParse(id); const mode = z.enum(["current_period", "extra"]).safeParse(formData.get("mode"));
  if (!parsed.success || !mode.success) redirect(`/recurring/${id}?error=invalid-generation`);
  if (mode.data === "extra" && formData.get("confirm_extra") !== "yes") redirect(`/recurring/${id}?error=extra-confirmation`);
  const { data, error } = await (await createServerSupabaseClient()).rpc("generate_recurring_expense_now", { p_id: parsed.data, p_mode: mode.data, p_today: berlinDate() });
  if (error) logDbError("generate recurring expense", error);
  revalidatePath("/"); revalidatePath("/expenses"); revalidatePath(`/recurring/${id}`);
  redirect(error || !data ? `/recurring/${id}?error=generation-failed` : `/expenses/${data}?success=recurring-generated`);
}

export async function deleteRecurringAction(id: string, formData: FormData) {
  await requireAuthorizedUser();
  const parsed = validId.safeParse(id);
  if (!parsed.success || formData.get("confirm") !== "DELETE") redirect(`/recurring/${id}?error=delete-confirmation`);
  const { error } = await (await createServerSupabaseClient()).from("recurring_expenses").delete().eq("id", parsed.data);
  if (error) logDbError("delete recurring rule", error);
  revalidatePath("/recurring"); redirect(error ? `/recurring/${id}?error=delete-failed` : "/recurring?success=recurring-deleted");
}
