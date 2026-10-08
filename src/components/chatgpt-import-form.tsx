"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveChatGPTImportAction } from "@/app/import/chatgpt/actions";
import { AmountInput } from "@/components/ui/amount-input";
import { parseChatGPTImport, repairChatGPTImport, type ImportErrorLocation } from "@/lib/chatgpt-import-parser";
import { formatMoneyFromCents } from "@/lib/money";
import { EXPENSE_CATEGORIES } from "@/types/expense";
import type { ChatGPTImport } from "@/types/chatgpt-import";
import { CLIPBOARD_DENIED_MESSAGE, OFFLINE_MESSAGE } from "@/lib/pwa-config";
import { FormLabelText } from "@/components/form-label-text";

const fieldClass = "mt-1 min-h-12 w-full rounded-xl border px-3 py-2";
const cents = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) : 0);

export function ChatGPTImportForm() {
  const [raw, setRaw] = useState("");
  const [draft, setDraft] = useState<ChatGPTImport | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [location, setLocation] = useState<ImportErrorLocation | null>(null);
  const [conflictId, setConflictId] = useState<string | null>(null);
  const [normalizationNotice, setNormalizationNotice] = useState<string | null>(null);
  const [repairPreview, setRepairPreview] = useState<{ text: string; changes: string[] } | null>(null);
  const [repairConfirmed, setRepairConfirmed] = useState(false);
  const [confirmedDifference, setConfirmedDifference] = useState<number | null>(null);
  const importIdentity = useRef<{ raw: string; key: string } | null>(null);
  const submitting = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  const sums = useMemo(() => {
    if (!draft) return null;
    const itemCents = draft.items.reduce((sum, item) => sum + cents(item.amount), 0);
    const adjustmentCents = draft.adjustments.reduce((sum, item) => sum + cents(item.amount), 0);
    const totalCents = cents(draft.total_amount);
    const hasRows = draft.items.length > 0 || draft.adjustments.length > 0;
    return { itemCents, adjustmentCents, totalCents, hasRows, differenceCents: hasRows ? totalCents - itemCents - adjustmentCents : 0 };
  }, [draft]);
  const mismatch = Boolean(sums && Math.abs(sums.differenceCents) > 1);
  // Confirmation is tied to the exact difference; editing an amount asks again.
  const reconciliationConfirmed = !mismatch || confirmedDifference === sums?.differenceCents;
  const canSave = !isPending && repairConfirmed && reconciliationConfirmed;

  const hasDraft = draft !== null;
  useEffect(() => { if (hasDraft) reviewHeading.current?.focus(); }, [hasDraft]);
  useEffect(() => { if (message) errorBox.current?.focus(); }, [message]);

  function parse(repair = false) {
    const result = repair ? repairChatGPTImport(raw) : parseChatGPTImport(raw);
    if (!result.data) { setMessage(result.error); setLocation(result.location ?? null); setNormalizationNotice(null); return; }
    setDraft(result.data);
    if (importIdentity.current?.raw !== raw) importIdentity.current = { raw, key: crypto.randomUUID() };
    setIdempotencyKey(importIdentity.current.key);
    setMessage(null); setLocation(null); setConflictId(null);
    setNormalizationNotice(result.notice);
    setRepairPreview(result.repairedText ? { text: result.repairedText, changes: result.changes ?? [] } : null);
    setRepairConfirmed(!result.repairedText);
    setConfirmedDifference(null);
  }

  async function pasteFromClipboard() {
    try {
      if (!navigator.clipboard?.readText) throw new Error("unsupported");
      const text = await navigator.clipboard.readText();
      setRaw(text); setLocation(null);
      setMessage(text ? null : "剪貼簿目前沒有文字。");
    } catch {
      setMessage(CLIPBOARD_DENIED_MESSAGE);
    }
  }

  function save() {
    if (!draft || !canSave || submitting.current) return;
    if (!navigator.onLine) { setMessage(OFFLINE_MESSAGE); return; }
    submitting.current = true;
    startTransition(async () => {
      try {
        const result = await saveChatGPTImportAction(draft, idempotencyKey, { reconciliationConfirmed: mismatch ? reconciliationConfirmed : undefined });
        if (result?.error) { setMessage(result.error); setConflictId(result.conflictId ?? null); }
      } finally {
        submitting.current = false;
      }
    });
  }

  const errorPanel = message && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" ref={errorBox} role="alert" tabIndex={-1}>
    <p className="break-words">{message}</p>
    {location && <figure className="mt-3"><figcaption className="text-xs">第 {location.line} 行附近{location.normalized ? "（已正規化標點後的文字）" : ""}：</figcaption><pre className="ui-snippet mt-1 rounded-lg bg-black/40 p-2 text-[#f5f5f5]"><span>{location.before}</span><mark className="rounded bg-red-500/40 px-0.5 text-[#fff]">{location.after.slice(0, 1) || "⏎"}</mark><span>{location.after.slice(1)}</span></pre></figure>}
    {conflictId && <Link className="ui-link" href={`/expenses/${conflictId}`}>開啟已存在的紀錄</Link>}
  </div>;

  if (!draft) {
    return (
      <section className="ui-card">
        <label className="font-semibold" htmlFor="chatgpt-json">ChatGPT JSON</label>
        <p className="mt-1 text-sm ui-muted" id="chatgpt-json-hint">貼上純 JSON 或 ```json code block；最多 100,000 個字元。</p>
        <textarea aria-describedby="chatgpt-json-hint chatgpt-json-status" autoCapitalize="off" autoCorrect="off" className={`${fieldClass} min-h-64 font-mono text-base`} id="chatgpt-json" onChange={(event) => { setRaw(event.target.value); setMessage(null); setLocation(null); }} placeholder={'{ "merchant": "…", … }'} spellCheck={false} value={raw} />
        <p aria-live="polite" className="mt-2 text-sm ui-muted" id="chatgpt-json-status">{raw.trim() ? `已輸入 ${raw.length.toLocaleString()} 個字元，尚未解析。` : "尚未貼上 JSON。"}</p>
        {errorPanel && <div className="mt-3">{errorPanel}</div>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button className="ui-btn ui-btn-primary" disabled={!raw.trim()} onClick={() => parse()} type="button">解析</button>
          <button className="ui-btn ui-btn-secondary" onClick={pasteFromClipboard} type="button">從剪貼簿貼上</button>
          <button className="ui-btn ui-btn-secondary" disabled={!raw.trim()} onClick={() => parse(true)} type="button">嘗試修復 JSON</button>
          <button className="ui-btn ui-btn-secondary" disabled={!raw} onClick={() => { setRaw(""); setMessage(null); setLocation(null); }} type="button">清除</button>
        </div>
      </section>
    );
  }

  const updateItem = (index: number, values: Partial<ChatGPTImport["items"][number]>) => setDraft((current) => current && ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item) }));
  const updateAdjustment = (index: number, values: Partial<ChatGPTImport["adjustments"][number]>) => setDraft((current) => current && ({ ...current, adjustments: current.adjustments.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item) }));
  const disabledReason = !repairConfirmed ? "請先勾選已核對修復差異。" : !reconciliationConfirmed ? "請先確認明細與總金額的差額。" : null;

  return (
    <section aria-labelledby="import-review-title" className="ui-card space-y-5">
      <div><p className="text-sm font-semibold text-emerald-700">JSON 格式與欄位驗證成功</p><h2 className="mt-1 text-xl font-bold" id="import-review-title" ref={reviewHeading} tabIndex={-1}>人工確認</h2>
        <p className="mt-1 text-sm ui-muted">{draft.merchant} · {draft.expense_date} · {draft.items.length} 個商品、{draft.adjustments.length} 個調整 · {formatMoneyFromCents(cents(draft.total_amount), /^[A-Z]{3}$/.test(draft.currency) ? draft.currency : "EUR")}</p></div>
      {normalizationNotice && <p className="rounded-2xl border border-blue-400/30 bg-blue-500/10 p-4 text-sm text-blue-200" role="status">{normalizationNotice}</p>}
      {repairPreview && <div className="min-w-0 space-y-3 rounded-2xl border border-blue-400/30 p-4"><h3 className="font-semibold">修復差異（尚未儲存）</h3><ul className="list-disc space-y-1 pl-5 text-sm">{repairPreview.changes.map((change, index) => <li className="break-words" key={index}>{change}</li>)}</ul><p className="text-sm">未補造商品、日期、數量、金額或付款方式。請逐項核對；原始輸入仍保留在此頁面。</p><div className="grid min-w-0 gap-3 sm:grid-cols-2"><details className="min-w-0"><summary className="text-sm font-semibold">原始輸入</summary><pre className="ui-snippet max-h-72 overflow-auto">{raw}</pre></details><details className="min-w-0"><summary className="text-sm font-semibold">修復後 JSON</summary><pre className="ui-snippet max-h-72 overflow-auto">{repairPreview.text}</pre></details></div><label className="flex min-h-11 items-start gap-3"><input checked={repairConfirmed} className="mt-0.5 h-5 w-5 shrink-0" onChange={(event) => setRepairConfirmed(event.target.checked)} type="checkbox" /><span>我已核對修復差異及所有商品、調整與金額</span></label></div>}
      {draft.warnings.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">ChatGPT warnings</p><ul className="mt-2 list-disc space-y-1 pl-5">{draft.warnings.map((warning, index) => <li className="break-words" key={`${warning}-${index}`}>{warning}</li>)}</ul></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="import-merchant" label="店家"><input className={fieldClass} id="import-merchant" onChange={(e) => setDraft({ ...draft, merchant: e.target.value })} value={draft.merchant} /></Field>
        <Field id="import-date" label="日期"><input className={fieldClass} id="import-date" onChange={(e) => setDraft({ ...draft, expense_date: e.target.value })} type="date" value={draft.expense_date} /></Field>
        <Field id="import-currency" label="幣別"><input autoCapitalize="characters" className={fieldClass} id="import-currency" maxLength={3} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} value={draft.currency} /></Field>
        <Field id="import-total" label="總金額"><AmountInput className={fieldClass} id="import-total" onValueChange={(total_amount) => setDraft({ ...draft, total_amount })} value={draft.total_amount} /></Field>
        <Field id="import-payment" label="付款方式（選填）"><input className={fieldClass} id="import-payment" onChange={(e) => setDraft({ ...draft, payment_method: e.target.value || undefined })} value={draft.payment_method ?? ""} /></Field>
        {draft.items.length === 0 && draft.adjustments.length === 0 && <Field id="import-category" label="類別"><CategorySelect id="import-category" onChange={(category) => setDraft({ ...draft, category })} value={draft.category ?? "其他"} /></Field>}
      </div>

      <div className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">商品明細 <span className="text-sm font-normal ui-muted">{draft.items.length}</span></h3><button className="ui-btn ui-btn-secondary" onClick={() => setDraft({ ...draft, items: [...draft.items, { name_original: "新商品", brand: "N/A", quantity: 1, amount: 0, category: "其他" }] })} type="button">＋ 新增商品</button></div>
        {draft.items.length === 0 && <p className="text-sm ui-muted">沒有商品明細。</p>}
        {draft.items.map((item, index) => <fieldset className="min-w-0 rounded-2xl border border-[var(--border)] p-4" key={index}><legend className="px-1 text-sm font-semibold">商品 {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2"><Field id={`item-${index}-original`} label="原始名稱"><input className={fieldClass} id={`item-${index}-original`} onChange={(e) => updateItem(index, { name_original: e.target.value })} value={item.name_original} /></Field><Field id={`item-${index}-normalized`} label="標準名稱（選填）"><input className={fieldClass} id={`item-${index}-normalized`} onChange={(e) => updateItem(index, { name_normalized: e.target.value || undefined })} value={item.name_normalized ?? ""} /></Field><Field id={`item-${index}-english`} label="英文名稱（選填）"><input className={fieldClass} id={`item-${index}-english`} onChange={(e) => updateItem(index, { english_name: e.target.value || undefined })} value={item.english_name ?? ""} /></Field><Field id={`item-${index}-brand`} label="品牌"><input className={fieldClass} id={`item-${index}-brand`} onChange={(e) => updateItem(index, { brand: e.target.value || "N/A" })} value={item.brand} /></Field><Field id={`item-${index}-group`} label="商品群組（選填）"><input className={fieldClass} id={`item-${index}-group`} onChange={(e) => updateItem(index, { product_group: e.target.value || undefined })} value={item.product_group ?? ""} /></Field><Field id={`item-${index}-quantity`} label="數量"><AmountInput className={fieldClass} id={`item-${index}-quantity`} maxDecimals={3} onValueChange={(quantity) => updateItem(index, { quantity })} value={item.quantity} /></Field><Field id={`item-${index}-amount`} label="該列總金額"><AmountInput className={fieldClass} id={`item-${index}-amount`} onValueChange={(amount) => updateItem(index, { amount })} value={item.amount} /></Field><Field id={`item-${index}-category`} label="類別"><CategorySelect id={`item-${index}-category`} onChange={(category) => updateItem(index, { category })} value={item.category} /></Field></div><button className="ui-btn ui-btn-danger mt-3" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, itemIndex) => itemIndex !== index) })} type="button">刪除此商品</button></fieldset>)}
      </div>

      <div className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">調整項目 <span className="text-sm font-normal ui-muted">{draft.adjustments.length}</span></h3><button className="ui-btn ui-btn-secondary" onClick={() => setDraft({ ...draft, adjustments: [...draft.adjustments, { name: "新調整", amount: 0, category: "其他" }] })} type="button">＋ 新增調整</button></div>
        {draft.adjustments.map((item, index) => <fieldset className="min-w-0 rounded-2xl border border-[var(--border)] p-4" key={index}><legend className="px-1 text-sm font-semibold">調整 {index + 1}</legend><div className="grid gap-3 sm:grid-cols-3"><Field id={`adj-${index}-name`} label="名稱"><input className={fieldClass} id={`adj-${index}-name`} onChange={(e) => updateAdjustment(index, { name: e.target.value })} value={item.name} /></Field><Field id={`adj-${index}-amount`} label="金額（− 折扣／+ 押金）"><AmountInput allowNegative className={fieldClass} id={`adj-${index}-amount`} onValueChange={(amount) => updateAdjustment(index, { amount })} value={item.amount} /></Field><Field id={`adj-${index}-category`} label="類別"><CategorySelect id={`adj-${index}-category`} onChange={(category) => updateAdjustment(index, { category })} value={item.category} /></Field></div><button className="ui-btn ui-btn-danger mt-3" onClick={() => setDraft({ ...draft, adjustments: draft.adjustments.filter((_, itemIndex) => itemIndex !== index) })} type="button">刪除此調整</button></fieldset>)}
      </div>

      {sums && sums.hasRows && <div className={`rounded-2xl border p-4 text-sm ${mismatch ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
        <dl className="grid grid-cols-2 gap-2"><dt>商品加總</dt><dd className="money-value text-right font-semibold">{formatMoneyFromCents(sums.itemCents, draft.currency)}</dd><dt>調整項加總</dt><dd className="money-value text-right font-semibold">{formatMoneyFromCents(sums.adjustmentCents, draft.currency)}</dd><dt>收據總金額</dt><dd className="money-value text-right font-semibold">{formatMoneyFromCents(sums.totalCents, draft.currency)}</dd><dt>差額</dt><dd className="money-value text-right font-semibold">{formatMoneyFromCents(sums.differenceCents, draft.currency)}</dd></dl>
        {mismatch && <><p className="mt-3 font-semibold">明細與總金額差異超過 0.01。系統不會自動修改任何金額；總金額會以收據總額為準儲存。</p><label className="mt-2 flex min-h-11 items-start gap-3"><input checked={reconciliationConfirmed} className="mt-0.5 h-5 w-5 shrink-0" onChange={(event) => setConfirmedDifference(event.target.checked ? sums.differenceCents : null)} type="checkbox" /><span>我已核對收據，確認以 {formatMoneyFromCents(sums.totalCents, draft.currency)} 儲存（差額 {formatMoneyFromCents(sums.differenceCents, draft.currency)}）</span></label></>}
      </div>}

      {errorPanel}
      <div className="grid gap-3 sm:grid-cols-3"><button className="ui-btn ui-btn-secondary" onClick={() => { setDraft(null); setMessage(null); setConflictId(null); }} type="button">返回修改 JSON</button><Link className="ui-btn ui-btn-secondary" href="/" onClick={(event) => { if (!window.confirm("確定放棄這次匯入？貼上的內容不會保存。")) event.preventDefault(); }}>取消匯入</Link><button aria-describedby={disabledReason ? "import-save-reason" : undefined} className="ui-btn ui-btn-primary" disabled={!canSave} onClick={save} type="button">{isPending ? "儲存中…" : "確認儲存"}</button></div>
      {disabledReason && <p className="text-sm ui-muted" id="import-save-reason">{disabledReason}</p>}
    </section>
  );
}

function Field({ children, id, label }: { children: React.ReactNode; id: string; label: string }) { return <div className="min-w-0"><label className="block text-sm font-semibold" htmlFor={id}><FormLabelText label={label} /></label>{children}</div>; }
function CategorySelect({ id, onChange, value }: { id: string; onChange: (value: (typeof EXPENSE_CATEGORIES)[number]) => void; value: (typeof EXPENSE_CATEGORIES)[number] }) { return <select className={fieldClass} id={id} onChange={(event) => onChange(event.target.value as (typeof EXPENSE_CATEGORIES)[number])} value={value}>{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>; }
