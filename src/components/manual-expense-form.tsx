"use client";

import { useMemo, useState, useTransition } from "react";
import { createManualExpenseAction } from "@/app/expenses/new/actions";
import { formatMoneyFromCents } from "@/lib/money";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/types/expense";
import type { ManualExpensePayload } from "@/lib/manual-expense-schema";
import { OFFLINE_MESSAGE } from "@/lib/pwa-config";
import { FormLabelText } from "@/components/form-label-text";

const field = "mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
type Item = NonNullable<ManualExpensePayload["items"]>[number];
type Adjustment = NonNullable<ManualExpensePayload["adjustments"]>[number];

function Label({ children, title }: { children: React.ReactNode; title: string }) {
  return <label className="block"><span className="block"><FormLabelText label={title} /></span>{children}</label>;
}

function Category({ value, onChange }: { value?: ExpenseCategory; onChange: (value: ExpenseCategory) => void }) {
  return <select className={field} value={value ?? "其他"} onChange={(event) => onChange(event.target.value as ExpenseCategory)}>{EXPENSE_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select>;
}

export function ManualExpenseForm({ today }: { today: string }) {
  const [draft, setDraft] = useState<ManualExpensePayload>({ merchant: "", expense_date: today, total_amount: 0, currency: "EUR", category: "其他", payment_method: "", notes: "", items: [], adjustments: [] });
  const [expanded, setExpanded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const rowsCents = useMemo(() => [...(draft.items ?? []), ...(draft.adjustments ?? [])].reduce((sum, row) => sum + Math.round(row.amount * 100), 0), [draft]);
  const difference = Math.round(draft.total_amount * 100) - rowsCents;
  const hasRows = Boolean(draft.items?.length || draft.adjustments?.length);
  const needsConfirmation = hasRows && Math.abs(difference) > 1;

  const updateItem = (index: number, values: Partial<Item>) => setDraft((current) => ({ ...current, items: (current.items ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item) }));
  const updateAdjustment = (index: number, values: Partial<Adjustment>) => setDraft((current) => ({ ...current, adjustments: (current.adjustments ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item) }));
  const submit = () => startTransition(async () => {
    setError(null);
    if (!navigator.onLine) { setError(OFFLINE_MESSAGE); return; }
    const result = await createManualExpenseAction(draft, key);
    if (result?.error) setError(result.error);
  });

  return <div className="space-y-5">
    {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p>}
    <div className="grid gap-5 sm:grid-cols-2">
      <Label title="店家名稱"><input className={field} value={draft.merchant} onChange={(event) => setDraft({ ...draft, merchant: event.target.value })} /></Label>
      <Label title="日期"><input className={field} type="date" value={draft.expense_date} onChange={(event) => setDraft({ ...draft, expense_date: event.target.value })} /></Label>
      <Label title="總金額"><input className={field} min="0.01" step="0.01" type="number" value={draft.total_amount || ""} onChange={(event) => setDraft({ ...draft, total_amount: Number(event.target.value) })} /></Label>
      <Label title="幣別"><input className={field} maxLength={3} value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} /></Label>
      <Label title="類別"><Category value={draft.category} onChange={(category) => setDraft({ ...draft, category })} /></Label>
      <Label title="付款方式（選填）"><input className={field} value={draft.payment_method ?? ""} onChange={(event) => setDraft({ ...draft, payment_method: event.target.value })} /></Label>
    </div>
    <Label title="備註（選填）"><textarea className={`${field} min-h-24`} maxLength={1000} value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Label>

    <section className="rounded-2xl border border-slate-200">
      <button aria-expanded={expanded} className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left font-semibold" onClick={() => setExpanded(!expanded)} type="button"><span>商品明細與調整（選填）</span><span aria-hidden>{expanded ? "−" : "+"}</span></button>
      {expanded && <div className="space-y-5 border-t border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold">商品明細</h2><button className="rounded-xl border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700" onClick={() => setDraft({ ...draft, items: [...(draft.items ?? []), { amount: 0 }] })} type="button">＋ 新增商品</button></div>
        {(draft.items ?? []).map((item, index) => <div className="space-y-3 rounded-2xl border border-slate-200 p-4" key={index}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label title="原始名稱"><input className={field} placeholder="未填自動使用 N/A" value={item.name_original ?? ""} onChange={(event) => updateItem(index, { name_original: event.target.value })} /></Label>
            <Label title="標準名稱"><input className={field} placeholder="未填自動使用 N/A" value={item.name_normalized ?? ""} onChange={(event) => updateItem(index, { name_normalized: event.target.value })} /></Label>
            <Label title="英文名稱"><input className={field} placeholder="未填自動使用 N/A" value={item.english_name ?? ""} onChange={(event) => updateItem(index, { english_name: event.target.value })} /></Label>
            <Label title="品牌"><input className={field} placeholder="N/A" value={item.brand ?? ""} onChange={(event) => updateItem(index, { brand: event.target.value })} /></Label>
            <Label title="商品群組"><input className={field} placeholder="其他" value={item.product_group ?? ""} onChange={(event) => updateItem(index, { product_group: event.target.value })} /></Label>
            <Label title="商品類別"><Category value={item.category ?? draft.category} onChange={(category) => updateItem(index, { category })} /></Label>
            <Label title="數量"><input className={field} min="0.001" step="0.001" type="number" value={item.quantity ?? 1} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} /></Label>
            <Label title="商品列金額"><input className={field} min="0" step="0.01" type="number" value={item.amount} onChange={(event) => updateItem(index, { amount: Number(event.target.value) })} /></Label>
            <Label title="單位"><input className={field} placeholder="N/A" value={item.unit ?? ""} onChange={(event) => updateItem(index, { unit: event.target.value })} /></Label>
            <Label title="單位容量"><input className={field} min="0.001" step="0.001" type="number" value={item.unit_quantity ?? 1} onChange={(event) => updateItem(index, { unit_quantity: Number(event.target.value) })} /></Label>
          </div>
          <Label title="商品備註"><textarea className={field} value={item.notes ?? ""} onChange={(event) => updateItem(index, { notes: event.target.value })} /></Label>
          <button className="text-sm font-semibold text-red-700" onClick={() => setDraft({ ...draft, items: (draft.items ?? []).filter((_, itemIndex) => itemIndex !== index) })} type="button">刪除此商品</button>
        </div>)}
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold">Adjustment</h2><button className="rounded-xl border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700" onClick={() => setDraft({ ...draft, adjustments: [...(draft.adjustments ?? []), { name: "", amount: 0, category: draft.category }] })} type="button">＋ 新增調整</button></div>
        {(draft.adjustments ?? []).map((adjustment, index) => <div className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-3" key={index}>
          <Label title="名稱"><input className={field} value={adjustment.name} onChange={(event) => updateAdjustment(index, { name: event.target.value })} /></Label>
          <Label title="金額（可為負數）"><input className={field} step="0.01" type="number" value={adjustment.amount} onChange={(event) => updateAdjustment(index, { amount: Number(event.target.value) })} /></Label>
          <Label title="類別"><Category value={adjustment.category ?? draft.category} onChange={(category) => updateAdjustment(index, { category })} /></Label>
          <button className="text-left text-sm font-semibold text-red-700" onClick={() => setDraft({ ...draft, adjustments: (draft.adjustments ?? []).filter((_, itemIndex) => itemIndex !== index) })} type="button">刪除此調整</button>
        </div>)}
        {hasRows && <div className={`rounded-2xl p-4 text-sm ${needsConfirmation ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}>明細與 adjustment 合計 {formatMoneyFromCents(rowsCents, draft.currency)}；與總額差額 {formatMoneyFromCents(difference, draft.currency)}。{needsConfirmation && <label className="mt-3 flex gap-2 font-semibold"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />我已確認差額，仍要儲存</label>}</div>}
      </div>}
    </section>
    <button className="min-h-12 w-full rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white disabled:bg-indigo-300" disabled={pending || (needsConfirmation && !confirmed)} onClick={submit} type="button">{pending ? "儲存中…" : "儲存消費"}</button>
  </div>;
}
