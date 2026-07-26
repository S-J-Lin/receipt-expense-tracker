type Props = {
  kind: "image" | "pdf" | "heic";
  name: string;
  url: string;
};

export function ReceiptPreview({ kind, name, url }: Props) {
  if (kind === "pdf") {
    return (
      <div className="space-y-3">
        <iframe className="h-96 w-full rounded-2xl border border-slate-200" src={url} title={`${name} PDF 預覽`} />
        <a className="inline-flex font-semibold text-indigo-600 underline" href={url} rel="noreferrer" target="_blank">在新頁面開啟 PDF</a>
      </div>
    );
  }
  if (kind === "heic") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        HEIC/HEIF 已成功選取或上傳，但部分瀏覽器無法直接預覽。你仍可
        <a className="ml-1 font-semibold underline" href={url} rel="noreferrer" target="_blank">開啟原始檔案</a>。
      </div>
    );
  }
  return (
    // Signed Storage URLs and local blob URLs are dynamic, so a native image is used.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={`${name} 收據預覽`} className="max-h-[32rem] w-full rounded-2xl bg-slate-100 object-contain" src={url} />
  );
}
