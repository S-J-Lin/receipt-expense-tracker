"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createManualExpenseAction } from "@/app/expenses/new/actions";
import { AmountInput } from "@/components/ui/amount-input";
import { formatMoneyFromCents } from "@/lib/money";
import { localIsoDate } from "@/lib/local-date";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/types/expense";
import type { ManualExpensePayload } from "@/lib/manual-expense-schema";
import { OFFLINE_MESSAGE } from "@/lib/pwa-config";
import { FormLabelText } from "@/components/form-label-text";

const field = "mt-1 min-h-12 w-full rounded-xl border px-3 py-2 text-base";
type Item = NonNullable<ManualExpensePayload["items"]>[number];
type Adjustment = NonNullable<ManualExpensePayload["adjustments"]>[number];
const cents = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) : 0);

function Field({ children, id, title, hint }: { children: React.ReactNode; id: string; title: string; hint?: string }) {
  return <div className="min-w-0"><label className="block text-sm font-semibold" htmlFor={id}><FormLabelText label={title} /></label>{children}{hint && <p className="ui-field-hint" id={`${id}-hint`}>{hint}</p>}</div>;
}

function Category({ id, value, onChange }: { id: string; value?: ExpenseCategory; onChange: (value: ExpenseCategory) => void }) {
  return <select className={field} id={id} value={value ?? "其他"} onChange={(event) => onChange(event.target.value as ExpenseCategory)}>{EXPENSE_CATEGORIES.map((option) => <option key={option}>{option}</option>)}</select>;
}

export function ManualExpenseForm() {
  const [draft, setDraft] = useState<ManualExpensePayload>(() => ({ merchant: "", expense_date: localIsoDate(), total_amount: 0, currency: "EUR", category: "其他", payment_method: "", notes: "", items: [], adjustments: [] }));
  const [expanded, setExpanded] = useState(false);
  const [confirmedDifference, setConfirmedDifference] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflictId, setConflictId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const submitting = useRef(false);
  const errorBox = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const rowsCents = useMemo(() => [...(draft.items ?? []), ...(draft.adjustments ?? [])].reduce((sum, row) => sum + cents(row.amount), 0), [draft]);
  const difference = cents(draft.total_amount) - rowsCents;
  const itemCount = draft.items?.length ?? 0;
  const adjustmentCount = draft.adjustments?.length ?? 0;
  const hasRows = itemCount + adjustmentCount > 0;
  const needsConfirmation = hasRows && Math.abs(difference) > 1;
  const confirmed = !needsConfirmation || confirmedDifference === difference;
  const merchantMissing = touched && !draft.merchant.trim();
  const totalInvalid = touched && !(draft.total_amount > 0);

  useEffect(() => { if (error) errorBox.current?.focus(); }, [error]);

  const updateItem = (index: number, values: Partial<Item>) => setDraft((current) => ({ ...current, items: (current.items ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item) }));
  const updateAdjustment = (index: number, values: Partial<Adjustment>) => setDraft((current) => ({ ...current, adjustments: (current.adjustments ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item) }));
  const submit = () => {
    setTouched(true);
    if (!draft.merchant.trim() || !(draft.total_amount > 0)) { setError("請填寫店家名稱與大於 0 的總金額。"); return; }
    if (!confirmed || submitting.current) return;
    if (!navigator.onLine) { setError(OFFLINE_MESSAGE); return; }
    submitting.current = true;
    startTransition(async () => {
      try {
        setError(null); setConflictId(null);
        const result = await createManualExpenseAction(draft, key);
        if (result?.error) { setError(result.error); setConflictId(result.conflictId ?? null); }
      } finally {
        submitting.current = false;
      }
    });
  };

  return <form className="space-y-5" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" ref={errorBox} role="alert" tabIndex={-1}><p>{error}</p>{conflictId && <Link className="ui-link" href={`/expenses/${conflictId}`}>開啟已存在的紀錄</Link>}</div>}
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="manual-merchant" title="店家名稱"><input aria-describedby={merchantMissing ? "manual-merchant-error" : undefined} aria-invalid={merchantMissing || undefined} autoComplete="off" className={field} enterKeyHint="next" id="manual-merchant" maxLength={200} onChange={(event) => setDraft({ ...draft, merchant: event.target.value })} required value={draft.merchant} />{merchantMissing && <p className="form-error" id="manual-merchant-error">請輸入店家名稱。</p>}</Field>
      <Field id="manual-date" title="日期"><input className={field} id="manual-date" onChange={(event) => setDraft({ ...draft, expense_date: event.target.value })} required type="date" value={draft.expense_date} /></Field>
      <Field id="manual-total" title="總金額"><AmountInput className={field} describedBy={totalInvalid ? "manual-total-error" : undefined} id="manual-total" onValueChange={(total_amount) => setDraft({ ...draft, total_amount })} required value={draft.total_amount} />{totalInvalid && <p className="form-error" id="manual-total-error">請輸入大於 0 的金額，例如 12,50。</p>}</Field>
      <Field id="manual-currency" title="幣別"><input autoCapitalize="characters" autoComplete="off" className={field} id="manual-currency" maxLength={3} onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} value={draft.currency} /></Field>
      <Field id="manual-category" title="類別"><Category id="manual-category" onChange={(category) => setDraft({ ...draft, category })} value={draft.category} /></Field>
      <Field id="manual-payment" title="付款方式（選填）"><input className={field} id="manual-payment" maxLength={100} onChange={(event) => setDraft({ ...draft, payment_method: event.target.value })} value={draft.payment_method ?? ""} /></Field>
    </div>
    <Field id="manual-notes" title="備註（選填）"><textarea className={`${field} min-h-24`} id="manual-notes" maxLength={1000} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} value={draft.notes ?? ""} /></Field>

    <section className="rounded-2xl border border-[var(--border)]">
      <button aria-controls="manual-details" aria-expanded={expanded} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold" onClick={() => setExpanded(!expanded)} type="button">
        <span className="min-w-0">商品明細與調整（選填）{hasRows && <span className="block text-xs font-normal ui-muted">{itemCount} 個商品、{adjustmentCount} 個調整 · 差額 {formatMoneyFromCents(difference, /^[A-Z]{3}$/.test(draft.currency) ? draft.currency : "EUR")}{expanded ? "" : "（收合中仍會一起儲存）"}</span>}</span><span aria-hidden className="shrink-0">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && <div className="space-y-5 border-t border-[var(--border)] p-4" id="manual-details">
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold">商品明細</h2><button className="ui-btn ui-btn-secondary" onClick={() => setDraft({ ...draft, items: [...(draft.items ?? []), { amount: 0 }] })} type="button">＋ 新增商品</button></div>
        {(draft.items ?? []).map((item, index) => <fieldset className="min-w-0 space-y-3 rounded-2xl border border-[var(--border)] p-4" key={index}>
          <legend className="px-1 text-sm font-semibold">商品 {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`m-item-${index}-original`} title="原始名稱（選填）"><input className={field} id={`m-item-${index}-original`} placeholder="未填自動使用 N/A" value={item.name_original ?? ""} onChange={(event) => updateItem(index, { name_original: event.target.value })} /></Field>
            <Field id={`m-item-${index}-normalized`} title="標準名稱（選填）"><input className={field} id={`m-item-${index}-normalized`} placeholder="未填自動使用 N/A" value={item.name_normalized ?? ""} onChange={(event) => updateItem(index, { name_normalized: event.target.value })} /></Field>
            <Field id={`m-item-${index}-english`} title="英文名稱（選填）"><input className={field} id={`m-item-${index}-english`} placeholder="未填自動使用 N/A" value={item.english_name ?? ""} onChange={(event) => updateItem(index, { english_name: event.target.value })} /></Field>
            <Field id={`m-item-${index}-brand`} title="品牌（選填）"><input className={field} id={`m-item-${index}-brand`} placeholder="N/A" value={item.brand ?? ""} onChange={(event) => updateItem(index, { brand: event.target.value })} /></Field>
            <Field id={`m-item-${index}-group`} title="商品群組（選填）"><input className={field} id={`m-item-${index}-group`} placeholder="其他" value={item.product_group ?? ""} onChange={(event) => updateItem(index, { product_group: event.target.value })} /></Field>
            <Field id={`m-item-${index}-category`} title="商品類別"><Category id={`m-item-${index}-category`} value={item.category ?? draft.category} onChange={(category) => updateItem(index, { category })} /></Field>
            <Field id={`m-item-${index}-quantity`} title="數量"><AmountInput className={field} id={`m-item-${index}-quantity`} maxDecimals={3} onValueChange={(quantity) => updateItem(index, { quantity })} value={item.quantity ?? 1} /></Field>
            <Field id={`m-item-${index}-amount`} title="商品列金額"><AmountInput className={field} id={`m-item-${index}-amount`} onValueChange={(amount) => updateItem(index, { amount })} value={item.amount} /></Field>
            <Field id={`m-item-${index}-unit`} title="單位（選填）"><input className={field} id={`m-item-${index}-unit`} placeholder="N/A" value={item.unit ?? ""} onChange={(event) => updateItem(index, { unit: event.target.value })} /></Field>
            <Field id={`m-item-${index}-unit-qty`} title="單位容量"><AmountInput className={field} id={`m-item-${index}-unit-qty`} maxDecimals={3} onValueChange={(unit_quantity) => updateItem(index, { unit_quantity })} value={item.unit_quantity ?? 1} /></Field>
          </div>
          <Field id={`m-item-${index}-notes`} title="商品備註（選填）"><textarea className={field} id={`m-item-${index}-notes`} value={item.notes ?? ""} onChange={(event) => updateItem(index, { notes: event.target.value })} /></Field>
          <button className="ui-btn ui-btn-danger" onClick={() => setDraft({ ...draft, items: (draft.items ?? []).filter((_, itemIndex) => itemIndex !== index) })} type="button">刪除此商品</button>
        </fieldset>)}
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold">調整項目</h2><button className="ui-btn ui-btn-secondary" onClick={() => setDraft({ ...draft, adjustments: [...(draft.adjustments ?? []), { name: "", amount: 0, category: draft.category }] })} type="button">＋ 新增調整</button></div>
        {(draft.adjustments ?? []).map((adjustment, index) => <fieldset className="grid min-w-0 gap-3 rounded-2xl border border-[var(--border)] p-4 sm:grid-cols-3" key={index}>
          <legend className="px-1 text-sm font-semibold">調整 {index + 1}</legend>
          <Field id={`m-adj-${index}-name`} title="名稱"><input className={field} id={`m-adj-${index}-name`} placeholder="例如 Pfand、Rabatt" value={adjustment.name} onChange={(event) => updateAdjustment(index, { name: event.target.value })} /></Field>
          <Field id={`m-adj-${index}-amount`} title="金額（− 折扣／+ 押金）"><AmountInput allowNegative className={field} id={`m-adj-${index}-amount`} onValueChange={(amount) => updateAdjustment(index, { amount })} value={adjustment.amount} /></Field>
          <Field id={`m-adj-${index}-category`} title="類別"><Category id={`m-adj-${index}-category`} value={adjustment.category ?? draft.category} onChange={(category) => updateAdjustment(index, { category })} /></Field>
          <button className="ui-btn ui-btn-danger sm:col-span-3 sm:justify-self-start" onClick={() => setDraft({ ...draft, adjustments: (draft.adjustments ?? []).filter((_, itemIndex) => itemIndex !== index) })} type="button">刪除此調整</button>
        </fieldset>)}
      </div>}
    </section>

    {hasRows && <div className={`rounded-2xl border p-4 text-sm ${needsConfirmation ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
      <p>明細與調整合計 {formatMoneyFromCents(rowsCents, /^[A-Z]{3}$/.test(draft.currency) ? draft.currency : "EUR")}；與總額差額 {formatMoneyFromCents(difference, /^[A-Z]{3}$/.test(draft.currency) ? draft.currency : "EUR")}。</p>
      {needsConfirmation && <label className="mt-3 flex min-h-11 items-start gap-3 font-semibold"><input checked={confirmed} className="mt-0.5 h-5 w-5 shrink-0" onChange={(event) => setConfirmedDifference(event.target.checked ? difference : null)} type="checkbox" /><span>我已確認差額，仍以總金額儲存</span></label>}
    </div>}
    <button aria-describedby={!confirmed ? "manual-disabled-reason" : undefined} className="ui-btn ui-btn-primary w-full" disabled={pending || !confirmed} type="submit">{pending ? "儲存中…" : "儲存消費"}</button>
    {!confirmed && <p className="text-sm ui-muted" id="manual-disabled-reason">請先確認明細與總金額的差額。</p>}
  </form>;
}
