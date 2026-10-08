"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveItemizedExpenseAction } from "@/app/expenses/[id]/edit/item-actions";
import { AmountInput } from "@/components/ui/amount-input";
import { formatMoneyFromCents } from "@/lib/money";
import { normalizeProductAlias } from "@/lib/product-aliases";
import { EXPENSE_CATEGORIES, type ExpenseWithDetails, type ProductAlias } from "@/types/expense";
import type { ChatGPTImportAdjustment, ChatGPTImportItem } from "@/types/chatgpt-import";
import { OFFLINE_MESSAGE } from "@/lib/pwa-config";
import { FormLabelText } from "@/components/form-label-text";

const field = "mt-1 min-h-12 w-full rounded-xl border px-3 py-2";
const cents = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) : 0);
type Draft = { merchant: string; expense_date: string; currency: string; total_amount: number;
  category: (typeof EXPENSE_CATEGORIES)[number]; payment_method?: string; notes?: string;
  items: ChatGPTImportItem[]; adjustments: ChatGPTImportAdjustment[] };

export function ItemizedExpenseEditor({ aliases, expense }: { aliases: ProductAlias[]; expense: ExpenseWithDetails }) {
  const [draft, setDraft] = useState<Draft>({ merchant: expense.merchant, expense_date: expense.expense_date,
    currency: expense.currency, total_amount: expense.amount, category: expense.category,
    payment_method: expense.payment_method ?? undefined, notes: expense.notes ?? undefined,
    items: expense.expense_items.map(({ name_original, name_normalized, english_name, brand, product_group,
      quantity, amount, category, confidence, unit, unit_quantity, notes }) => ({
        name_original: name_original ?? name_normalized ?? "", name_normalized: name_normalized ?? undefined,
        english_name: english_name ?? undefined, brand: brand || "N/A", product_group: product_group ?? "其他", quantity, amount, category,
        confidence: confidence ?? undefined, unit: unit ?? undefined, unit_quantity: unit_quantity ?? undefined,
        notes: notes ?? undefined })),
    adjustments: expense.expense_adjustments.map(({ name, amount, category }) => ({ name, amount, category })) });
  const [remember, setRemember] = useState<boolean[]>(expense.expense_items.map(() => false));
  const [overwrite, setOverwrite] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<ItemizedEditResult | null>(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const statusBox = useRef<HTMLDivElement>(null);
  const savedForAliasConfirmation = Boolean(result?.mainSaved && result.aliasConflicts?.length);
  const totals = useMemo(() => { const items = draft.items.reduce((sum, item) => sum + cents(item.amount), 0);
    const adjustments = draft.adjustments.reduce((sum, item) => sum + cents(item.amount), 0);
    return { items, adjustments, difference: cents(draft.total_amount) - items - adjustments, hasRows: draft.items.length + draft.adjustments.length > 0 }; }, [draft]);
  const currency = /^[A-Z]{3}$/.test(draft.currency) ? draft.currency : "EUR";
  useEffect(() => { if (result) statusBox.current?.focus(); }, [result]);
  const updateItem = (index: number, values: Partial<ChatGPTImportItem>) => setDraft((current) => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, ...values } : item) }));
  const updateAdjustment = (index: number, values: Partial<ChatGPTImportAdjustment>) => setDraft((current) => ({ ...current, adjustments: current.adjustments.map((item, i) => i === index ? { ...item, ...values } : item) }));
  const submit = () => {
    if (submitting.current) return;
    if (!navigator.onLine) { setResult({ error: OFFLINE_MESSAGE }); return; }
    submitting.current = true;
    startTransition(async () => {
      try {
        setResult(await saveItemizedExpenseAction(expense.id, {
          ...draft, aliases: draft.items.flatMap((item, index) => remember[index] && item.name_normalized
            ? [{ alias: item.name_original, normalized_name: item.name_normalized, product_group: item.product_group,
                category: item.category, brand: item.brand, overwrite }] : []) }, key));
      } finally { submitting.current = false; }
    });
  };

  return <div className="space-y-6">
    {(result?.error || savedForAliasConfirmation) && <div ref={statusBox} tabIndex={-1}>
      {result?.error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{result.error}</p>}
      {savedForAliasConfirmation && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status"><p className="font-semibold">消費明細已儲存，但別名已有不同對應：</p><ul className="mt-2 list-disc pl-5">{result?.aliasConflicts?.map((item) => <li className="break-words" key={item}>{item}</li>)}</ul><label className="mt-3 flex min-h-11 items-start gap-3"><input checked={overwrite} className="mt-0.5 h-5 w-5 shrink-0" onChange={(event) => setOverwrite(event.target.checked)} type="checkbox" /><span>我確認覆蓋上述既有別名對應</span></label></div>}
    </div>}
    <fieldset className="grid gap-4 sm:grid-cols-2" disabled={savedForAliasConfirmation}><legend className="sr-only">消費資料</legend>
      <Field id="edit-merchant" label="店家"><input className={field} id="edit-merchant" value={draft.merchant} onChange={(e) => setDraft({ ...draft, merchant: e.target.value })} /></Field>
      <Field id="edit-date" label="日期"><input className={field} id="edit-date" type="date" value={draft.expense_date} onChange={(e) => setDraft({ ...draft, expense_date: e.target.value })} /></Field>
      <Field id="edit-total" label="總金額"><AmountInput className={field} id="edit-total" onValueChange={(total_amount) => setDraft({ ...draft, total_amount })} value={draft.total_amount} /></Field>
      <Field id="edit-currency" label="幣別"><input autoCapitalize="characters" className={field} id="edit-currency" maxLength={3} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></Field>
      <Field id="edit-category" label="類別"><Category id="edit-category" value={draft.category} onChange={(category) => setDraft({ ...draft, category })} /></Field>
      <Field id="edit-payment" label="付款方式（選填）"><input className={field} id="edit-payment" value={draft.payment_method ?? ""} onChange={(e) => setDraft({ ...draft, payment_method: e.target.value || undefined })} /></Field>
      <div className="sm:col-span-2"><Field id="edit-notes" label="消費備註（選填）"><textarea className={`${field} min-h-24`} id="edit-notes" value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value || undefined })} /></Field></div>
    </fieldset>
    <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">商品明細 <span className="text-sm font-normal ui-muted">{draft.items.length}</span></h2><button className="ui-btn ui-btn-secondary" disabled={savedForAliasConfirmation} onClick={() => { setDraft({ ...draft, items: [...draft.items, { name_original: "新商品", brand: "N/A", quantity: 1, amount: 0, category: "其他" }] }); setRemember([...remember, false]); }} type="button">＋ 新增商品</button></div>
      {draft.items.map((item, index) => { const normalizedOriginal = normalizeProductAlias(item.name_original); const exact = aliases.find((alias) => alias.alias_normalized === normalizedOriginal); const suggestions = aliases.filter((alias) => alias.alias_normalized !== normalizedOriginal && (normalizedOriginal.includes(alias.alias_normalized) || alias.alias_normalized.includes(normalizedOriginal))).slice(0, 3); const id = `edit-item-${index}`; return <div className="rounded-2xl border border-[var(--border)] p-4" key={index}><fieldset className="grid min-w-0 gap-3 sm:grid-cols-2" disabled={savedForAliasConfirmation}><legend className="px-1 text-sm font-semibold">商品 {index + 1}</legend>
        <Field id={`${id}-original`} label="原始名稱"><input className={field} id={`${id}-original`} value={item.name_original} onChange={(e) => updateItem(index, { name_original: e.target.value })} /></Field>
        <Field id={`${id}-normalized`} label="標準名稱（選填）"><input className={field} id={`${id}-normalized`} value={item.name_normalized ?? ""} onChange={(e) => updateItem(index, { name_normalized: e.target.value || undefined })} /></Field>
        <Field id={`${id}-english`} label="英文名稱（選填）"><input className={field} id={`${id}-english`} value={item.english_name ?? ""} onChange={(e) => updateItem(index, { english_name: e.target.value || undefined })} /></Field>
        {exact && <p className="rounded-xl border border-blue-400/30 bg-blue-500/10 p-3 text-sm text-blue-200 sm:col-span-2">目前精確別名：{exact.alias} → {exact.normalized_name}</p>}
        {!exact && suggestions.length > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">可能相關的別名（不會自動套用）：{suggestions.map((alias) => `${alias.alias} → ${alias.normalized_name}`).join("；")}</p>}
        <Field id={`${id}-brand`} label="品牌"><input className={field} id={`${id}-brand`} value={item.brand} onChange={(e) => updateItem(index, { brand: e.target.value || "N/A" })} /></Field>
        <Field id={`${id}-group`} label="商品群組（選填）"><input className={field} id={`${id}-group`} value={item.product_group ?? ""} onChange={(e) => updateItem(index, { product_group: e.target.value || undefined })} /></Field>
        <Field id={`${id}-quantity`} label="數量"><AmountInput className={field} id={`${id}-quantity`} maxDecimals={3} onValueChange={(quantity) => updateItem(index, { quantity })} value={item.quantity} /></Field>
        <Field id={`${id}-amount`} label="金額"><AmountInput className={field} id={`${id}-amount`} onValueChange={(amount) => updateItem(index, { amount })} value={item.amount} /></Field>
        <Field id={`${id}-category`} label="類別"><Category id={`${id}-category`} value={item.category} onChange={(category) => updateItem(index, { category })} /></Field>
        <Field id={`${id}-confidence`} label="信心（選填，0–1）"><input className={field} id={`${id}-confidence`} inputMode="decimal" value={item.confidence ?? ""} onChange={(e) => updateItem(index, { confidence: e.target.value ? Number(e.target.value.replace(",", ".")) : undefined })} /></Field>
        <Field id={`${id}-unit`} label="單位（選填）"><input className={field} id={`${id}-unit`} value={item.unit ?? ""} onChange={(e) => updateItem(index, { unit: e.target.value || undefined })} /></Field>
        <Field id={`${id}-unit-qty`} label="單位容量（選填）"><input className={field} id={`${id}-unit-qty`} inputMode="decimal" value={item.unit_quantity ?? ""} onChange={(e) => updateItem(index, { unit_quantity: e.target.value ? Number(e.target.value.replace(",", ".")) : undefined })} /></Field>
        <div className="sm:col-span-2"><Field id={`${id}-notes`} label="商品備註（選填）"><textarea className={field} id={`${id}-notes`} value={item.notes ?? ""} onChange={(e) => updateItem(index, { notes: e.target.value || undefined })} /></Field></div>
        <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2"><input checked={remember[index] ?? false} className="h-5 w-5 shrink-0" onChange={(e) => setRemember(remember.map((value, i) => i === index ? e.target.checked : value))} type="checkbox" />記住這個名稱對應</label>
      </fieldset><button className="ui-btn ui-btn-danger mt-3" disabled={savedForAliasConfirmation} onClick={() => { setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) }); setRemember(remember.filter((_, i) => i !== index)); }} type="button">刪除此商品</button></div>; })}
    </section>
    <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">調整項目 <span className="text-sm font-normal ui-muted">{draft.adjustments.length}</span></h2><button className="ui-btn ui-btn-secondary" disabled={savedForAliasConfirmation} onClick={() => setDraft({ ...draft, adjustments: [...draft.adjustments, { name: "新調整", amount: 0, category: "其他" }] })} type="button">＋ 新增調整</button></div>
      {draft.adjustments.map((item, index) => <fieldset className="grid min-w-0 gap-3 rounded-2xl border border-[var(--border)] p-4 sm:grid-cols-3" disabled={savedForAliasConfirmation} key={index}><legend className="px-1 text-sm font-semibold">調整 {index + 1}</legend>
        <Field id={`edit-adj-${index}-name`} label="名稱"><input className={field} id={`edit-adj-${index}-name`} value={item.name} onChange={(e) => updateAdjustment(index, { name: e.target.value })} /></Field>
        <Field id={`edit-adj-${index}-amount`} label="金額（− 折扣／+ 押金）"><AmountInput allowNegative className={field} id={`edit-adj-${index}-amount`} onValueChange={(amount) => updateAdjustment(index, { amount })} value={item.amount} /></Field>
        <Field id={`edit-adj-${index}-category`} label="類別"><Category id={`edit-adj-${index}-category`} value={item.category} onChange={(category) => updateAdjustment(index, { category })} /></Field>
        <button className="ui-btn ui-btn-danger sm:col-span-3 sm:justify-self-start" onClick={() => setDraft({ ...draft, adjustments: draft.adjustments.filter((_, i) => i !== index) })} type="button">刪除此調整</button>
      </fieldset>)}
    </section>
    {totals.hasRows && <div className={`rounded-2xl border p-4 text-sm ${Math.abs(totals.difference) > 1 ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>商品 {formatMoneyFromCents(totals.items, currency)} · 調整 {formatMoneyFromCents(totals.adjustments, currency)} · 差額 {formatMoneyFromCents(totals.difference, currency)}{Math.abs(totals.difference) > 1 && <p className="mt-2 font-semibold">差額超過 0.01，請人工確認；仍允許儲存，總金額以收據為準，不會自動修改。</p>}</div>}
    <button className="ui-btn ui-btn-primary w-full" disabled={pending || (savedForAliasConfirmation && !overwrite)} onClick={submit} type="button">{pending ? "儲存中…" : savedForAliasConfirmation ? "確認覆蓋別名" : "儲存全部修改"}</button>
  </div>;
}

type ItemizedEditResult = Awaited<ReturnType<typeof saveItemizedExpenseAction>>;
function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) { return <div className="min-w-0"><label className="block text-sm font-semibold" htmlFor={id}><FormLabelText label={label} /></label>{children}</div>; }
function Category({ id, value, onChange }: { id: string; value: (typeof EXPENSE_CATEGORIES)[number]; onChange: (value: (typeof EXPENSE_CATEGORIES)[number]) => void }) { return <select className={field} id={id} value={value} onChange={(e) => onChange(e.target.value as (typeof EXPENSE_CATEGORIES)[number])}>{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>; }
