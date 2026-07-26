"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { replaceExpenseReceiptAction, verifyReceiptUploadAction } from "@/app/receipts/upload/actions";
import { ReceiptPreview } from "@/components/receipt-preview";
import { createReceiptObjectPath, RECEIPT_BUCKET, RECEIPT_MAX_BYTES, validateReceiptFile } from "@/lib/receipt-validation";
import { createSupabaseClient } from "@/lib/supabase/client";

const ACCEPT = "image/jpeg,image/png,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.heic,.heif,.pdf";

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function ReceiptUploadForm({ expenseId }: { expenseId?: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>, other: React.RefObject<HTMLInputElement | null>) {
    const next = event.target.files?.[0] ?? null;
    setError(next && next.size > RECEIPT_MAX_BYTES ? "檔案不可超過 10 MB。" : "");
    setFile(next);
    if (other.current) other.current.value = "";
  }

  function clearFile() {
    setFile(null);
    setError("");
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    setError("");
    try {
      const validation = await validateReceiptFile(file);
      if (!validation.data) return setError(validation.error);
      const path = createReceiptObjectPath(validation.data.extension);
      const { error: uploadError } = await createSupabaseClient().storage.from(RECEIPT_BUCKET).upload(path, file, {
        cacheControl: "3600",
        contentType: validation.data.mimeType,
        upsert: false,
      });
      if (uploadError) return setError(`收據上傳失敗：${uploadError.message}`);

      const result = expenseId
        ? await replaceExpenseReceiptAction(expenseId, path)
        : await verifyReceiptUploadAction(path);
      if (result.error) {
        await createSupabaseClient().storage.from(RECEIPT_BUCKET).remove([path]);
        return setError(result.error);
      }
      if (expenseId) {
        router.push(`/expenses/${expenseId}?success=updated${result.warning ? `&warning=${result.warning}` : ""}`);
      } else {
        router.push(`/expenses/new?receipt=uploaded&receiptPath=${encodeURIComponent(path)}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上傳收據時發生未知錯誤。");
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  const extension = file?.name.split(".").pop()?.toLowerCase();
  const kind = extension === "pdf" ? "pdf" : extension === "heic" || extension === "heif" ? "heic" : "image";

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-2xl bg-indigo-600 px-5 font-semibold text-white hover:bg-indigo-700 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2">
          拍攝照片
          <input ref={cameraRef} accept={ACCEPT} capture="environment" className="sr-only" onChange={(event) => chooseFile(event, libraryRef)} type="file" />
        </label>
        <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 font-semibold text-slate-800 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2">
          從相簿或檔案選取
          <input ref={libraryRef} accept={ACCEPT} className="sr-only" onChange={(event) => chooseFile(event, cameraRef)} type="file" />
        </label>
      </div>

      {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p>}
      {file && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate font-semibold">{file.name}</p><p className="text-sm text-slate-600">{file.type || "未知格式"} · {formatBytes(file.size)}</p></div>
            <button className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={clearFile} type="button">清除</button>
          </div>
          {previewUrl && <ReceiptPreview kind={kind} name={file.name} url={previewUrl} />}
        </section>
      )}

      <button className="min-h-12 w-full rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300" disabled={!file || Boolean(error) || pending} type="submit">
        {pending ? "上傳與驗證中…" : expenseId ? "上傳並替換收據" : "上傳並繼續填寫消費"}
      </button>
      <p className="text-sm text-slate-500">支援 JPEG、PNG、HEIC、HEIF、PDF，最大 10 MB。HEIC/HEIF 在部分瀏覽器可能無法直接預覽。</p>
    </form>
  );
}
