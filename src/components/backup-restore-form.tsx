"use client";

import { useRef, useState, useTransition } from "react";
import { previewBackupAction, restoreBackupAction, type RestoreReport } from "@/app/import/backup/actions";
import { BACKUP_MAX_BYTES, parseBackupText, restoreModePlan, type ReceiptTrackerBackup, type RestoreMode, type RestorePreview } from "@/lib/backup-restore";
import { OFFLINE_MESSAGE } from "@/lib/pwa-config";

const field = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2";
const card = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm";

export function BackupRestoreForm() {
  const input = useRef<HTMLInputElement>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [backup, setBackup] = useState<ReceiptTrackerBackup | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<RestoreMode>("skip");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [report, setReport] = useState<RestoreReport | null>(null);
  const [restoreKey] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();

  const clear = () => { setFileInfo(null); setBackup(null); setPreview(null); setWarnings([]); setError(null); setReport(null); setMode("skip"); setConfirmed(false); setConfirmationText(""); if (input.current) input.current.value = ""; };
  const load = async (file: File) => {
    clear(); setFileInfo({ name: file.name, size: file.size });
    if (!file.name.toLowerCase().endsWith(".json") || !["application/json", "text/json", ""].includes(file.type)) { setError("只接受 JSON 檔案。"); return; }
    if (file.size > BACKUP_MAX_BYTES) { setError("備份檔超過 25 MB。"); return; }
    const parsed = parseBackupText(await file.text());
    if (!parsed.data) { setError(parsed.errors.join("；")); return; }
    setBackup(parsed.data); setWarnings(parsed.warnings);
    if (!navigator.onLine) { setError(OFFLINE_MESSAGE); return; }
    startTransition(async () => {
      const result = await previewBackupAction(parsed.data);
      if (result.error) setError(result.error);
      else { setPreview(result.preview ?? null); setWarnings((current) => [...current, ...(result.warnings ?? [])]); }
    });
  };
  const restore = () => backup && (navigator.onLine ? startTransition(async () => {
    setError(null);
    const result = await restoreBackupAction(backup, mode, restoreKey, confirmed, confirmationText);
    if (result.error) setError(result.error); else setReport(result.report ?? null);
  }) : setError(OFFLINE_MESSAGE));
  const downloadReport = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `receipt-tracker_restore-report_${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const drop = (event: React.DragEvent) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void load(file); };
  const plan = preview ? restoreModePlan(preview, mode) : null;

  return <div className="space-y-5">
    <section className={card}>
      <div className="rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-6 text-center" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
        <p className="font-semibold">拖放 Full Backup JSON 到這裡</p><p className="mt-1 text-sm text-slate-600">僅限 JSON，最大 25 MB；檔案內容不會被執行。</p>
        <button className="mt-4 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white" onClick={() => input.current?.click()} type="button">選擇 JSON 檔案</button>
        <input accept="application/json,.json" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void load(file); }} ref={input} type="file" />
      </div>
      {fileInfo && <p className="mt-3 text-sm">{fileInfo.name} · {(fileInfo.size / 1024).toFixed(1)} KB</p>}
      {pending && !preview && <p className="mt-3 text-sm text-indigo-700">正在驗證與建立預覽…</p>}
      {error && <p className="mt-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p>}
      {warnings.map((warning) => <p className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950" key={warning}>{warning}</p>)}
    </section>

    {backup && preview && <>
      <section className={card}><h2 className="text-xl font-bold">備份資訊與預覽</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <p><span className="block text-sm text-slate-500">版本</span>{backup.export_version}</p><p><span className="block text-sm text-slate-500">固定支出規則</span>{preview.recurring_expense_count}</p>
          <p><span className="block text-sm text-slate-500">日期</span>{backup.date_range.start ?? "最早"}～{backup.date_range.end ?? "最新"}</p><p><span className="block text-sm text-slate-500">預估大小</span>{(preview.estimated_restore_bytes / 1024).toFixed(1)} KB</p>
          <p>Expenses：{preview.expense_count}</p><p>Items：{preview.item_count}</p><p>Adjustments：{preview.adjustment_count}</p><p>Aliases：{preview.alias_count}</p>
          <p>Exact duplicate：{preview.exact_duplicates}</p><p>Probable duplicate：{preview.probable_duplicates}</p><p>Unique：{preview.unique_records}</p><p>可合併：{preview.merge_records}</p>
        </div>
        <p className="mt-3 text-sm">幣別：{Object.entries(preview.currencies).map(([currency, count]) => `${currency} ${count}`).join("、") || "無"}</p>
        <p className="mt-2 text-sm">現有資料：expenses {preview.existing_expense_count}、items {preview.existing_item_count}、adjustments {preview.existing_adjustment_count}、aliases {preview.existing_alias_count}</p>
        {preview.alias_conflicts.length > 0 && <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm"><p className="font-semibold">Alias conflicts（不會靜默覆寫）</p>{preview.alias_conflicts.map((value) => <p key={value.alias}>{value.alias}：現有「{value.existing}」／備份「{value.backup}」</p>)}</div>}
        {preview.missing_attachments.length > 0 && <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm"><p className="font-semibold">缺少 {preview.missing_attachments.length} 個收據附件</p><p>expense 仍可還原，Storage path 會保留，且不會建立假的 signed URL。</p></div>}
      </section>

      <section className={card}><h2 className="text-xl font-bold">Restore mode</h2>
        <div className="mt-4 space-y-3">{(["skip", "merge", "replace"] as RestoreMode[]).map((value) => <label className="flex gap-3 rounded-2xl border border-slate-200 p-4" key={value}><input checked={mode === value} name="mode" onChange={() => { setMode(value); setConfirmed(false); setConfirmationText(""); }} type="radio" /><span><strong>{value === "skip" ? "Skip duplicates（預設）" : value === "merge" ? "Merge" : "Replace all"}</strong><span className="mt-1 block text-sm text-slate-600">{value === "skip" ? "只加入 unique records，疑似重複全部跳過。" : value === "merge" ? "保留現有 header；只在現有明細為空時補入備份明細，alias 衝突不覆寫。" : "刪除目前 ledger、items、adjustments 與 aliases，再完整還原。不可逆。"}</span></span></label>)}</div>
        {plan && <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold">此模式預計：新增 {plan.add}、跳過 {plan.skip}、合併 {plan.merge}{plan.delete_all ? "；並完整取代現有帳本" : ""}。Alias conflicts：{preview.alias_conflicts.length}。</p>}
        {mode === "replace" && <div className="mt-4 space-y-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-950"><p className="font-bold">Replace all 將刪除：目前 {preview.existing_expense_count} expenses、{preview.existing_item_count} items、{preview.existing_adjustment_count} adjustments、{preview.existing_alias_count} aliases。失敗時 transaction 會 rollback。</p><label className="flex gap-2"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />我了解此操作不可逆，並確認完整取代目前帳本</label><label className="block font-semibold">輸入 RESTORE<input className={field} onChange={(event) => setConfirmationText(event.target.value)} value={confirmationText} /></label></div>}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row"><button className="min-h-12 flex-1 rounded-2xl border border-slate-300 font-semibold" disabled={pending} onClick={clear} type="button">取消</button><button className="min-h-12 flex-1 rounded-2xl bg-indigo-600 font-semibold text-white disabled:bg-slate-300" disabled={pending || (mode === "replace" && (!confirmed || confirmationText !== "RESTORE"))} onClick={restore} type="button">{pending ? "還原中，請勿離開…" : "確認還原"}</button></div>
      </section>
    </>}

    {report && <section className={card}><h2 className="text-xl font-bold text-emerald-800">還原完成</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><p>Expenses：{report.imported_expenses}</p><p>Items：{report.imported_items}</p><p>Adjustments：{report.imported_adjustments}</p><p>Aliases：{report.imported_aliases}</p><p>Recurring：{report.imported_recurring_expenses ?? 0}</p><p>Skipped：{report.skipped_duplicates}</p><p>Merged：{report.merged_records}</p><p>Conflicts：{report.conflicts}</p><p>Duration：{report.duration_ms} ms</p></div><p className="mt-3 text-sm">模式：{report.restore_mode}；缺少附件：{report.missing_attachments.length}</p><button className="mt-4 rounded-xl border border-emerald-300 px-4 py-3 font-semibold text-emerald-800" onClick={downloadReport} type="button">下載 Import Report JSON</button></section>}
  </div>;
}
