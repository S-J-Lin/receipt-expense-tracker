"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { saveChatGPTImportAction } from "@/app/import/chatgpt/actions";
import { parseChatGPTImport } from "@/lib/chatgpt-import-parser";
import { formatMoneyFromCents, moneyToCents } from "@/lib/money";
import { EXPENSE_CATEGORIES } from "@/types/expense";
import type { ChatGPTImport } from "@/types/chatgpt-import";
import { CLIPBOARD_DENIED_MESSAGE, OFFLINE_MESSAGE } from "@/lib/pwa-config";

const fieldClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export function ChatGPTImportForm() {
  const [raw, setRaw] = useState("");
  const [draft, setDraft] = useState<ChatGPTImport | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sums = useMemo(() => {
    if (!draft) return null;
    const itemCents = draft.items.reduce((sum, item) => sum + moneyToCents(item.amount), 0);
    const adjustmentCents = draft.adjustments.reduce((sum, item) => sum + moneyToCents(item.amount), 0);
    const totalCents = moneyToCents(draft.total_amount);
    return { itemCents, adjustmentCents, totalCents, differenceCents: totalCents - itemCents - adjustmentCents };
  }, [draft]);

  function parse() {
    const result = parseChatGPTImport(raw);
    if (!result.data) { setMessage(result.error); return; }
    setDraft(result.data);
    setIdempotencyKey(crypto.randomUUID());
    setMessage(null);
  }

  async function pasteFromClipboard() {
    try {
      if (!navigator.clipboard?.readText) throw new Error("unsupported");
      const text = await navigator.clipboard.readText();
      setRaw(text);
      setMessage(text ? "已從剪貼簿貼上，請按「解析」。" : "剪貼簿目前沒有文字。" );
    } catch {
      setMessage(CLIPBOARD_DENIED_MESSAGE);
    }
  }

  if (!draft) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <label className="font-semibold text-slate-900" htmlFor="chatgpt-json">ChatGPT JSON</label>
        <textarea id="chatgpt-json" className={`${fieldClass} mt-2 min-h-72 font-mono text-base`} onChange={(event) => { setRaw(event.target.value); setMessage(null); }} placeholder={'貼上純 JSON 或 ```json code block'} spellCheck={false} value={raw} />
        <div aria-live="polite" className={`mt-3 rounded-xl p-3 text-sm ${message ? "bg-amber-50 text-amber-900" : raw.trim() ? "bg-blue-50 text-blue-900" : "bg-slate-50 text-slate-600"}`}>
          {message ?? (raw.trim() ? `已輸入 ${raw.length.toLocaleString()} 個字元，尚未解析。` : "尚未貼上 JSON。")}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <button className="min-h-12 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 font-semibold text-indigo-700" onClick={pasteFromClipboard} type="button">從剪貼簿貼上</button>
          <button className="min-h-12 rounded-2xl bg-indigo-600 px-4 font-semibold text-white disabled:bg-slate-300" disabled={!raw.trim()} onClick={parse} type="button">解析</button>
          <button className="min-h-12 rounded-2xl border border-slate-300 px-4 font-semibold text-slate-700" onClick={() => { setRaw(""); setMessage(null); }} type="button">清除</button>
        </div>
      </section>
    );
  }

  const updateItem = (index: number, values: Partial<ChatGPTImport["items"][number]>) => setDraft((current) => current && ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item) }));
  const updateAdjustment = (index: number, values: Partial<ChatGPTImport["adjustments"][number]>) => setDraft((current) => current && ({ ...current, adjustments: current.adjustments.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item) }));

  return (
    <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div><p className="text-sm font-semibold text-emerald-700">JSON 格式與 schema 驗證成功</p><h2 className="mt-1 text-xl font-bold">人工確認</h2></div>
      {draft.warnings.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">ChatGPT warnings</p><ul className="mt-2 list-disc space-y-1 pl-5">{draft.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="店家"><input className={fieldClass} onChange={(e) => setDraft({ ...draft, merchant: e.target.value })} value={draft.merchant} /></Field>
        <Field label="日期"><input className={fieldClass} onChange={(e) => setDraft({ ...draft, expense_date: e.target.value })} type="date" value={draft.expense_date} /></Field>
        <Field label="幣別"><input className={fieldClass} maxLength={3} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} value={draft.currency} /></Field>
        <Field label="總金額"><input className={fieldClass} min="0.01" onChange={(e) => setDraft({ ...draft, total_amount: Number(e.target.value) })} step="0.01" type="number" value={draft.total_amount} /></Field>
        <Field label="付款方式（選填）"><input className={fieldClass} onChange={(e) => setDraft({ ...draft, payment_method: e.target.value || undefined })} value={draft.payment_method ?? ""} /></Field>
        {draft.items.length === 0 && draft.adjustments.length === 0 && <Field label="類別"><CategorySelect onChange={(category) => setDraft({ ...draft, category })} value={draft.category ?? "其他"} /></Field>}
      </div>

      <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-lg font-bold">商品明細</h3><button className="rounded-xl border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700" onClick={() => setDraft({ ...draft, items: [...draft.items, { name_original: "新商品", brand: "N/A", quantity: 1, amount: 0, category: "其他" }] })} type="button">＋ 新增商品</button></div>
        {draft.items.length === 0 && <p className="text-sm text-slate-500">沒有商品明細。</p>}
        {draft.items.map((item, index) => <div className="rounded-2xl border border-slate-200 p-4" key={index}><div className="grid gap-3 sm:grid-cols-2"><Field label="原始名稱"><input className={fieldClass} onChange={(e) => updateItem(index, { name_original: e.target.value })} value={item.name_original} /></Field><Field label="標準名稱"><input className={fieldClass} onChange={(e) => updateItem(index, { name_normalized: e.target.value || undefined })} value={item.name_normalized ?? ""} /></Field><Field label="英文名稱（選填）"><input className={fieldClass} onChange={(e) => updateItem(index, { english_name: e.target.value || undefined })} value={item.english_name ?? ""} /></Field><Field label="品牌"><input className={fieldClass} onChange={(e) => updateItem(index, { brand: e.target.value || "N/A" })} value={item.brand} /></Field><Field label="商品群組（選填）"><input className={fieldClass} onChange={(e) => updateItem(index, { product_group: e.target.value || undefined })} value={item.product_group ?? ""} /></Field><Field label="數量"><input className={fieldClass} min="0.001" onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} step="0.001" type="number" value={item.quantity} /></Field><Field label="該列總金額"><input className={fieldClass} min="0" onChange={(e) => updateItem(index, { amount: Number(e.target.value) })} step="0.01" type="number" value={item.amount} /></Field><Field label="類別"><CategorySelect onChange={(category) => updateItem(index, { category })} value={item.category} /></Field></div><button className="mt-3 text-sm font-semibold text-red-700" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, itemIndex) => itemIndex !== index) })} type="button">刪除此商品</button></div>)}
      </div>

      <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-lg font-bold">調整項目</h3><button className="rounded-xl border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700" onClick={() => setDraft({ ...draft, adjustments: [...draft.adjustments, { name: "新調整", amount: 0, category: "其他" }] })} type="button">＋ 新增調整</button></div>
        {draft.adjustments.map((item, index) => <div className="rounded-2xl border border-slate-200 p-4" key={index}><div className="grid gap-3 sm:grid-cols-3"><Field label="名稱"><input className={fieldClass} onChange={(e) => updateAdjustment(index, { name: e.target.value })} value={item.name} /></Field><Field label="金額（可為負數）"><input className={fieldClass} onChange={(e) => updateAdjustment(index, { amount: Number(e.target.value) })} step="0.01" type="number" value={item.amount} /></Field><Field label="類別"><CategorySelect onChange={(category) => updateAdjustment(index, { category })} value={item.category} /></Field></div><button className="mt-3 text-sm font-semibold text-red-700" onClick={() => setDraft({ ...draft, adjustments: draft.adjustments.filter((_, itemIndex) => itemIndex !== index) })} type="button">刪除此調整</button></div>)}
      </div>

      {sums && <div className={`rounded-2xl border p-4 text-sm ${Math.abs(sums.differenceCents) > 1 ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}><div className="grid grid-cols-2 gap-2"><span>商品加總</span><strong>{formatMoneyFromCents(sums.itemCents, draft.currency)}</strong><span>調整項加總</span><strong>{formatMoneyFromCents(sums.adjustmentCents, draft.currency)}</strong><span>ChatGPT total_amount</span><strong>{formatMoneyFromCents(sums.totalCents, draft.currency)}</strong><span>差額</span><strong>{formatMoneyFromCents(sums.differenceCents, draft.currency)}</strong></div>{Math.abs(sums.differenceCents) > 1 && <p className="mt-3 font-semibold">明細與總金額差異超過 0.01，請確認後再儲存。系統不會自動忽略或修改差額。</p>}</div>}

      {message && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-800" role="alert">{message}</p>}
      <div className="grid gap-3 sm:grid-cols-3"><button className="min-h-12 rounded-2xl border border-slate-300 px-4 font-semibold" onClick={() => { setDraft(null); setMessage(null); }} type="button">返回重新貼上</button><Link className="flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 px-4 font-semibold" href="/">取消匯入</Link><button className="min-h-12 rounded-2xl bg-indigo-600 px-4 font-semibold text-white disabled:bg-slate-300" disabled={isPending} onClick={() => { if (!navigator.onLine) { setMessage(OFFLINE_MESSAGE); return; } startTransition(async () => { const result = await saveChatGPTImportAction(draft, idempotencyKey); if (result?.error) setMessage(result.error); }); }} type="button">{isPending ? "儲存中…" : "確認儲存"}</button></div>
    </section>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="block text-sm font-medium text-slate-700"><span className="mb-1 block">{label}</span>{children}</label>; }
function CategorySelect({ onChange, value }: { onChange: (value: (typeof EXPENSE_CATEGORIES)[number]) => void; value: (typeof EXPENSE_CATEGORIES)[number] }) { return <select className={fieldClass} onChange={(event) => onChange(event.target.value as (typeof EXPENSE_CATEGORIES)[number])} value={value}>{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>; }
