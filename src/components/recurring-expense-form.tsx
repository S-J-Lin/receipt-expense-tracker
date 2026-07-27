"use client";

import { useActionState } from "react";
import type { RecurringActionState } from "@/app/recurring/actions";
import { EXPENSE_CATEGORIES } from "@/types/expense";
import type { RecurringExpense } from "@/types/recurring-expense";

const field = "min-h-12 w-full rounded-xl border border-slate-300 px-3 py-2";

export function RecurringExpenseForm({ action, initial }: { action: (state: RecurringActionState, formData: FormData) => Promise<RecurringActionState>; initial?: RecurringExpense }) {
  const [state, formAction, pending] = useActionState(action, { message: "" });
  const error = (name: string) => state.errors?.[name]?.[0];
  return <form action={formAction} className="space-y-6">
    {state.message && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{state.message}</p>}
    <div className="grid gap-6 sm:grid-cols-2">
      <Field error={error("merchant")} label="名稱／店家"><input aria-invalid={Boolean(error("merchant"))} className={field} defaultValue={initial?.merchant} name="merchant" required /></Field>
      <Field error={error("amount")} label="金額"><input aria-invalid={Boolean(error("amount"))} className={field} defaultValue={initial?.amount} inputMode="decimal" min="0.01" name="amount" required step="0.01" type="number" /></Field>
      <Field error={error("currency")} label="幣別"><input className={field} defaultValue={initial?.currency ?? "EUR"} maxLength={3} name="currency" required /></Field>
      <Field label="類別"><select className={field} defaultValue={initial?.category ?? "其他"} name="category">{EXPENSE_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="付款方式（選填）"><input className={field} defaultValue={initial?.payment_method ?? ""} name="payment_method" /></Field>
      <Field error={error("day_of_month")} label="每月扣款日"><input className={field} defaultValue={initial?.day_of_month ?? 1} max={31} min={1} name="day_of_month" required type="number" /></Field>
      <Field label="開始日期"><input className={field} defaultValue={initial?.start_date ?? new Date().toISOString().slice(0, 10)} name="start_date" required type="date" /></Field>
      <Field error={error("end_date")} label="結束日期（選填）"><input className={field} defaultValue={initial?.end_date ?? ""} name="end_date" type="date" /></Field>
    </div>
    <Field label="備註（選填）"><textarea className={`${field} min-h-28`} defaultValue={initial?.notes ?? ""} maxLength={1000} name="notes" /></Field>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input className="h-5 w-5" defaultChecked={initial?.is_active ?? true} name="is_active" type="checkbox" />建立後啟用每月排程</label>
    <p className="text-sm text-slate-500">若選擇 29、30 或 31 日而該月沒有此日期，會在該月最後一天建立。</p>
    <button className="min-h-12 w-full rounded-2xl bg-indigo-600 px-5 font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "儲存中…" : "儲存固定支出"}</button>
  </form>;
}

function Field({ children, error, label }: { children: React.ReactNode; error?: string; label: string }) {
  const optional = label.endsWith("（選填）");
  return <label className="block"><span className="block">{optional ? label.slice(0, -4) : label}{optional && <span className="form-optional">（選填）</span>}</span>{children}{error && <span className="form-error block">{error}</span>}</label>;
}

