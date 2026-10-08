"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { RecurringActionState } from "@/app/recurring/actions";
import { formatMoneyFromCents, moneyToCents, parseDecimalInput } from "@/lib/money";
import { backfillPreview } from "@/lib/recurring-expenses";
import { EXPENSE_CATEGORIES } from "@/types/expense";
import type { RecurringExpense } from "@/types/recurring-expense";

const field = "mt-1 min-h-12 w-full rounded-xl border px-3 py-2";

export function RecurringExpenseForm({ action, initial, today }: { action: (state: RecurringActionState, formData: FormData) => Promise<RecurringActionState>; initial?: RecurringExpense; today: string }) {
  const [state, formAction, pending] = useActionState(action, { message: "" });
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [day, setDay] = useState(String(initial?.day_of_month ?? 1));
  const [start, setStart] = useState(initial?.start_date ?? today);
  const [end, setEnd] = useState(initial?.end_date ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? "EUR");
  const [backfill, setBackfill] = useState(false);
  const error = (name: string) => state.errors?.[name]?.[0];
  const isNew = !initial;
  const dayNumber = Number(day);
  const pastRuns = isNew && Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 31 && /^\d{4}-\d{2}-\d{2}$/.test(start) ? backfillPreview(dayNumber, start, today, end || null) : [];
  const parsedAmount = parseDecimalInput(amount);
  const currencyCode = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "EUR";

  useEffect(() => { if (state.message) errorRef.current?.focus(); }, [state]);

  return <form action={formAction} className="space-y-6">
    {state.message && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" ref={errorRef} role="alert" tabIndex={-1}>{state.message}</p>}
    <div className="grid gap-5 sm:grid-cols-2">
      <Field error={error("merchant")} id="rule-merchant" label="名稱／店家"><input aria-describedby={error("merchant") ? "rule-merchant-error" : undefined} aria-invalid={Boolean(error("merchant"))} autoComplete="off" className={field} defaultValue={initial?.merchant} id="rule-merchant" name="merchant" required /></Field>
      <Field error={error("amount")} id="rule-amount" label="金額"><input aria-describedby={error("amount") ? "rule-amount-error" : undefined} aria-invalid={Boolean(error("amount"))} autoComplete="off" className={field} id="rule-amount" inputMode="decimal" name="amount" onChange={(event) => setAmount(event.target.value)} placeholder="例如 12,50" required value={amount} /></Field>
      <Field error={error("currency")} id="rule-currency" label="幣別"><input aria-describedby={error("currency") ? "rule-currency-error" : undefined} aria-invalid={Boolean(error("currency"))} autoCapitalize="characters" autoComplete="off" className={field} id="rule-currency" maxLength={3} name="currency" onChange={(event) => setCurrency(event.target.value.toUpperCase())} required value={currency} /></Field>
      <Field id="rule-category" label="類別"><select className={field} defaultValue={initial?.category ?? "其他"} id="rule-category" name="category">{EXPENSE_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field id="rule-payment" label="付款方式（選填）"><input className={field} defaultValue={initial?.payment_method ?? ""} id="rule-payment" name="payment_method" /></Field>
      <Field error={error("day_of_month")} id="rule-day" label="每月扣款日"><input aria-describedby={error("day_of_month") ? "rule-day-error" : "rule-day-hint"} aria-invalid={Boolean(error("day_of_month"))} className={field} id="rule-day" inputMode="numeric" max={31} min={1} name="day_of_month" onChange={(event) => setDay(event.target.value)} required type="number" value={day} /><span className="ui-field-hint block" id="rule-day-hint">29–31 日遇到短月時，使用該月最後一天。</span></Field>
      <Field error={error("start_date")} id="rule-start" label="開始日期"><input className={field} id="rule-start" name="start_date" onChange={(event) => { setStart(event.target.value); setBackfill(false); }} required type="date" value={start} /></Field>
      <Field error={error("end_date")} id="rule-end" label="結束日期（選填）"><input aria-describedby={error("end_date") ? "rule-end-error" : undefined} aria-invalid={Boolean(error("end_date"))} className={field} id="rule-end" name="end_date" onChange={(event) => setEnd(event.target.value)} type="date" value={end} /></Field>
    </div>
    <Field id="rule-notes" label="備註（選填）"><textarea className={`${field} min-h-28`} defaultValue={initial?.notes ?? ""} id="rule-notes" maxLength={1000} name="notes" /></Field>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input className="h-5 w-5 shrink-0" defaultChecked={initial?.is_active ?? true} name="is_active" type="checkbox" />{isNew ? "建立後啟用每月排程" : "啟用每月排程（從今天起重新計算下次日期，不補建過去月份）"}</label>

    {pastRuns.length > 0 && <fieldset className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <legend className="px-1 font-semibold">開始日期在過去</legend>
      <p>預設<strong>不會</strong>補建過去月份；排程會從今天之後的第一個扣款日開始。</p>
      <label className="flex min-h-11 items-start gap-3"><input checked={backfill} className="mt-0.5 h-5 w-5 shrink-0" name="backfill" onChange={(event) => setBackfill(event.target.checked)} type="checkbox" /><span>補建過去 {pastRuns.length} 個月份的消費</span></label>
      {backfill && <div className="space-y-2">
        <p>將建立（每筆 {parsedAmount !== null ? formatMoneyFromCents(moneyToCents(parsedAmount), currencyCode) : "—"}）：</p>
        <ul className="max-h-48 overflow-auto rounded-xl border border-amber-200 p-2 font-mono text-xs">{pastRuns.map((run) => <li key={run}>{run}</li>)}</ul>
        <p>若這些月份已手動記過，補建會造成<strong>重複計算</strong>。每日排程每次最多建立 12 筆，超過時會在之後幾天繼續。</p>
        <label className="flex min-h-11 items-start gap-3 font-semibold"><input className="mt-0.5 h-5 w-5 shrink-0" name="backfill_confirm" required type="checkbox" /><span>我已確認這些月份沒有重複的手動紀錄</span></label>
      </div>}
    </fieldset>}

    <button className="ui-btn ui-btn-primary w-full" disabled={pending} type="submit">{pending ? "儲存中…" : "儲存固定支出"}</button>
  </form>;
}

function Field({ children, error, id, label }: { children: React.ReactNode; error?: string; id: string; label: string }) {
  const optional = label.endsWith("（選填）");
  return <div><label className="block text-sm font-semibold" htmlFor={id}>{optional ? label.slice(0, -4) : label}{optional && <span className="form-optional">（選填）</span>}</label>{children}{error && <span className="form-error block" id={`${id}-error`}>{error}</span>}</div>;
}
