"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { previewBackupAction, restoreBackupAction, type RestoreReport } from "@/app/import/backup/actions";
import { BACKUP_MAX_BYTES, parseBackupText, restoreModePlan, type ReceiptTrackerBackup, type RestoreMode, type RestorePreview } from "@/lib/backup-restore";
import { backupTransportError, encodeBackupForTransport, type BackupTransport } from "@/lib/backup-transport";
import { OFFLINE_MESSAGE } from "@/lib/pwa-config";

const MODE_LABELS: Record<RestoreMode, { title: string; description: string }> = {
  skip: { title: "Skip duplicates（預設）", description: "只加入新紀錄；與現有資料相同或疑似相同的紀錄會跳過。備份中兩筆相同的合法消費會分別保留。" },
  merge: { title: "Merge", description: "保留現有消費 header；只在現有明細為空時補入備份明細；alias 衝突不覆寫；固定支出規則以備份內容更新。" },
  replace: { title: "Replace all", description: "刪除目前所有消費、商品明細、調整、商品別名與固定支出規則，再完整還原。不可逆。" },
};

async function fingerprint(text: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${text.length}:${text.slice(0, 64)}:${text.slice(-64)}`;
  }
}

type Operation = { key: string; signature: string; completed: boolean };

export function BackupRestoreForm() {
  const input = useRef<HTMLInputElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const reportHeading = useRef<HTMLHeadingElement>(null);
  const operation = useRef<Operation | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; fingerprint: string } | null>(null);
  const [backup, setBackup] = useState<ReceiptTrackerBackup | null>(null);
  const transport = useRef<BackupTransport | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<RestoreMode>("skip");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [report, setReport] = useState<RestoreReport | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => { if (preview) previewHeading.current?.focus(); }, [preview]);
  useEffect(() => { if (report) reportHeading.current?.focus(); }, [report]);

  const clear = () => { transport.current = null; setFileInfo(null); setBackup(null); setPreview(null); setWarnings([]); setError(null); setReport(null); setMode("skip"); setConfirmed(false); setConfirmationText(""); operation.current = null; if (input.current) input.current.value = ""; };
  const load = async (file: File) => {
    clear();
    if (!file.name.toLowerCase().endsWith(".json") || !["application/json", "text/json", ""].includes(file.type)) { setFileInfo({ name: file.name, size: file.size, fingerprint: "" }); setError("只接受 JSON 檔案。"); return; }
    if (file.size > BACKUP_MAX_BYTES) { setFileInfo({ name: file.name, size: file.size, fingerprint: "" }); setError("備份檔超過 25 MB。"); return; }
    const text = await file.text();
    setFileInfo({ name: file.name, size: file.size, fingerprint: await fingerprint(text) });
    const parsed = parseBackupText(text);
    if (!parsed.data) { setError(parsed.errors.join("；")); return; }
    setBackup(parsed.data); setWarnings(parsed.warnings);
    if (!navigator.onLine) { setError(OFFLINE_MESSAGE); return; }
    startTransition(async () => {
      transport.current = await encodeBackupForTransport(text);
      const sizeError = backupTransportError(transport.current);
      if (sizeError) { transport.current = null; setError(sizeError); return; }
      const result = await previewBackupAction(transport.current);
      if (result.error) setError(result.error);
      else { setPreview(result.preview ?? null); setWarnings((current) => [...current, ...(result.warnings ?? [])]); }
    });
  };

  /** A new key per new operation; the same key only for a retry of the identical file + mode. */
  const keyFor = (signature: string) => {
    const current = operation.current;
    if (current && current.signature === signature && !current.completed) return current.key;
    const next = { key: crypto.randomUUID(), signature, completed: false };
    operation.current = next;
    return next.key;
  };

  const plan = preview ? restoreModePlan(preview, mode) : null;
  const replaceBlocked = mode === "replace" && Boolean(preview?.is_partial);
  const canRestore = Boolean(backup && preview) && !pending && !replaceBlocked && !(mode === "replace" && (!confirmed || confirmationText !== "RESTORE"));

  const restore = () => {
    if (!backup || !fileInfo || !canRestore || !transport.current) return;
    const payload = transport.current;
    if (!navigator.onLine) { setError(OFFLINE_MESSAGE); return; }
    const signature = `${mode}:${fileInfo.fingerprint}`;
    const key = keyFor(signature);
    startTransition(async () => {
      setError(null);
      const result = await restoreBackupAction(payload, mode, key, confirmed, confirmationText);
      if (result.error) {
        setError(result.error);
        if (result.retryable === false) operation.current = null;
      } else {
        if (operation.current) operation.current.completed = true;
        setReport(result.report ?? null);
      }
    });
  };
  const downloadReport = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `receipt-tracker_restore-report_${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const drop = (event: React.DragEvent) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void load(file); };

  return <div className="space-y-5">
    <section className="ui-card">
      <div className="rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-5 text-center" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
        <p className="font-semibold">選擇或拖放 Full Backup JSON</p><p className="mt-1 text-sm ui-muted">僅限 JSON，最大 25 MB；檔案內容不會被執行。選取檔案不會修改資料。</p>
        <label className="ui-btn ui-btn-primary mt-4 cursor-pointer" htmlFor="backup-file">選擇 JSON 檔案</label>
        <input accept="application/json,.json" className="sr-only" id="backup-file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void load(file); }} ref={input} type="file" />
      </div>
      {fileInfo && <p className="mt-3 break-words text-sm">{fileInfo.name} · {(fileInfo.size / 1024).toFixed(1)} KB</p>}
      {pending && !preview && <p aria-live="polite" className="mt-3 text-sm text-indigo-700" role="status">正在驗證與建立預覽…</p>}
      {error && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p>}
      {warnings.map((warning) => <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" key={warning}>{warning}</p>)}
    </section>

    {backup && preview && !report && <>
      <section aria-labelledby="restore-preview-title" className="ui-card"><h2 className="text-xl font-bold" id="restore-preview-title" ref={previewHeading} tabIndex={-1}>備份資訊與預覽</h2>
        <p className={`mt-3 rounded-xl p-3 text-sm ${preview.is_partial ? "border border-amber-200 bg-amber-50 text-amber-950" : "border border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
          {preview.is_partial ? `部分備份（已套用篩選：${Object.entries(preview.scope_filters ?? {}).filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join("、") || "日期範圍"}）。不能用於 Replace all。` : "完整備份（未套用篩選）。"}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[["版本", backup.export_version], ["產生時間", backup.generated_at.slice(0, 16).replace("T", " ")], ["日期", `${backup.date_range.start ?? "最早"}～${backup.date_range.end ?? "最新"}`], ["預估大小", `${(preview.estimated_restore_bytes / 1024).toFixed(1)} KB`],
            ["消費", preview.expense_count], ["商品明細", preview.item_count], ["調整", preview.adjustment_count], ["商品別名", preview.alias_count],
            ["固定支出規則", preview.recurring_expense_count], ["完全相同", preview.exact_duplicates], ["疑似相同", preview.probable_duplicates], ["新紀錄", preview.unique_records]].map(([label, value]) => <div className="min-w-0" key={String(label)}><dt className="ui-muted">{label}</dt><dd className="break-words font-semibold">{value}</dd></div>)}
        </dl>
        <p className="mt-3 text-sm">幣別：{Object.entries(preview.currencies).map(([currency, count]) => `${currency} ${count}`).join("、") || "無"}</p>
        <p className="mt-1 text-sm ui-muted">現有資料：消費 {preview.existing_expense_count}、明細 {preview.existing_item_count}、調整 {preview.existing_adjustment_count}、別名 {preview.existing_alias_count}、固定支出規則 {preview.existing_recurring_count}</p>
        {preview.same_signature_in_backup > 0 && <p className="mt-3 rounded-xl border border-blue-400/30 bg-blue-500/10 p-3 text-sm text-blue-200">備份中有 {preview.same_signature_in_backup} 筆消費與另一筆同店家、同日、同金額。它們會被視為不同的真實消費分別還原，不會互相合併。</p>}
        {preview.recurring_past_due > 0 && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{preview.recurring_past_due} 個啟用中的固定支出規則「下次執行日」已過。還原不會補建過去月份：早於本月的日期會調整到本月的排程日；如需補記請手動新增。</p>}
        {preview.alias_conflicts.length > 0 && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">商品別名衝突（不會靜默覆寫）</p>{preview.alias_conflicts.map((value) => <p className="break-words" key={value.alias}>{value.alias}：現有「{value.existing}」／備份「{value.backup}」</p>)}</div>}
        {preview.missing_attachments.length > 0 && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">缺少 {preview.missing_attachments.length} 個收據附件</p><p>消費仍可還原，Storage path 會保留，且不會建立假的 signed URL。</p></div>}
      </section>

      <section aria-labelledby="restore-mode-title" className="ui-card"><h2 className="text-xl font-bold" id="restore-mode-title">還原模式</h2>
        <fieldset className="mt-4 space-y-3"><legend className="sr-only">選擇還原模式</legend>{(["skip", "merge", "replace"] as RestoreMode[]).map((value) => <label className={`flex min-h-12 cursor-pointer gap-3 rounded-2xl border p-4 ${mode === value ? "border-[var(--accent)]" : "border-[var(--border)]"}`} key={value}><input checked={mode === value} className="mt-1 h-5 w-5 shrink-0" name="mode" onChange={() => { setMode(value); setConfirmed(false); setConfirmationText(""); setError(null); }} type="radio" /><span className="min-w-0"><strong>{MODE_LABELS[value].title}</strong><span className="mt-1 block text-sm ui-muted">{MODE_LABELS[value].description}</span></span></label>)}</fieldset>
        {plan && !replaceBlocked && <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold">此模式預計：新增 {plan.add}、跳過 {plan.skip}、合併 {plan.merge}{plan.delete_all ? "；並完整取代現有帳本與固定支出規則" : ""}。商品別名衝突：{preview.alias_conflicts.length}。所有變更在同一個資料庫交易中完成，任何錯誤都會全部回滾。</p>}
        {replaceBlocked && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">部分備份不能用於 Replace all。請改選 Skip 或 Merge，或先匯出未篩選的完整備份。</p>}
        {mode === "replace" && !replaceBlocked && <div className="mt-4 space-y-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-950"><p className="font-bold">Replace all 將刪除：目前 {preview.existing_expense_count} 筆消費、{preview.existing_item_count} 筆明細、{preview.existing_adjustment_count} 筆調整、{preview.existing_alias_count} 個商品別名與 {preview.existing_recurring_count} 個固定支出規則。收據檔案保留在 Storage。</p><label className="flex min-h-11 items-start gap-3"><input checked={confirmed} className="mt-0.5 h-5 w-5 shrink-0" onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>我了解此操作不可逆，並確認完整取代目前帳本</span></label><label className="block font-semibold" htmlFor="restore-confirm">輸入 RESTORE</label><input autoCapitalize="characters" autoComplete="off" className="min-h-12 w-full rounded-xl border px-3 py-2" id="restore-confirm" onChange={(event) => setConfirmationText(event.target.value)} spellCheck={false} value={confirmationText} /></div>}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row"><button className="ui-btn ui-btn-secondary flex-1" disabled={pending} onClick={clear} type="button">取消</button><button aria-describedby={!canRestore && !pending ? "restore-disabled-reason" : undefined} className="ui-btn ui-btn-primary flex-1" disabled={!canRestore} onClick={restore} type="button">{pending ? "還原中，請勿離開…" : "確認還原"}</button></div>
        {!canRestore && !pending && <p className="mt-2 text-sm ui-muted" id="restore-disabled-reason">{replaceBlocked ? "部分備份不能取代全部資料。" : mode === "replace" ? "請勾選確認並輸入 RESTORE。" : ""}</p>}
      </section>
    </>}

    {report && <section aria-labelledby="restore-report-title" className="ui-card"><h2 className="text-xl font-bold text-emerald-800" id="restore-report-title" ref={reportHeading} tabIndex={-1}>{report.replayed ? "還原已完成（重複送出，回傳同一份報告）" : "還原完成"}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[["新增消費", report.imported_expenses], ["新增明細", report.imported_items], ["新增調整", report.imported_adjustments], ["新增別名", report.imported_aliases], ["新增固定支出規則", report.imported_recurring_expenses ?? 0], ["跳過", report.skipped_duplicates], ["合併", report.merged_records], ["別名衝突", report.conflicts], ["固定支出連結", report.recurring_links_restored ?? 0], ["調整排程的規則", report.advanced_recurring_rules ?? 0], ["耗時", `${report.duration_ms} ms`], ["模式", report.restore_mode]].map(([label, value]) => <div key={String(label)}><dt className="ui-muted">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
      {(report.recurring_links_dropped ?? 0) > 0 && <p className="mt-3 text-sm text-amber-900">{report.recurring_links_dropped} 筆消費的固定支出連結無法驗證（規則不存在或該月份已有紀錄），消費已保留但未連結。</p>}
      <p className="mt-3 text-sm">缺少附件：{report.missing_attachments.length}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row"><button className="ui-btn ui-btn-secondary" onClick={downloadReport} type="button">下載還原報告 JSON</button><button className="ui-btn ui-btn-secondary" onClick={clear} type="button">還原另一個檔案</button></div>
    </section>}
  </div>;
}
