import type { Metadata } from "next";
import Link from "next/link";
import { ExportRangeFields } from "@/components/export/export-range-fields";
import { getExportDataset } from "@/lib/export-data";
import { exportPreview, type ExportFormat } from "@/lib/export";
import { filtersToSearchParams, hasAnyExportFilter, parseExportQuery } from "@/lib/export-query";
import { EXPENSE_CATEGORIES, EXPENSE_SOURCES } from "@/types/expense";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "匯出資料" };

const field = "mt-1 min-h-12 w-full rounded-xl border px-3 py-2";
const formats: { value: ExportFormat; title: string; description: string }[] = [
  { value: "expenses-csv", title: "CSV — 消費", description: "每列一筆消費，適合試算表。文字欄位已防止公式注入。" },
  { value: "items-csv", title: "CSV — 商品明細", description: "每列一個商品或調整項。" },
  { value: "full-json", title: "JSON — Full Backup", description: "完整關聯資料、商品別名與固定支出規則；標示是否為部分備份。不含秘密或 signed URL。" },
  { value: "chatgpt-json", title: "JSON — ChatGPT 分析包", description: "乾淨的分析資料，不含內部 ID 或收據路徑。" },
];
const SOURCE_LABELS: Record<string, string> = { manual: "手動", chatgpt_import: "ChatGPT", receipt_upload: "收據上傳", recurring: "固定支出" };

function size(bytes: number): string { return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

export default async function ExportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { range, filters, error: queryError } = parseExportQuery(params);
  const result = queryError ? { data: null, error: queryError } : await getExportDataset(filters);
  const preview = result.data ? exportPreview(result.data, filters) : null;
  const query = filtersToSearchParams(range, filters).toString();
  const partial = hasAnyExportFilter(filters);
  const activeFilters = [filters.merchant && `店家：${filters.merchant}`, filters.category && `類別：${filters.category}`, filters.product_group && `商品群組：${filters.product_group}`, filters.brand && `品牌：${filters.brand}`, filters.source && `來源：${SOURCE_LABELS[filters.source] ?? filters.source}`].filter(Boolean);

  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-5xl space-y-5">
    <div><h1 className="text-2xl font-bold sm:text-3xl">匯出資料</h1><p className="mt-2 ui-muted">檔案只在你按下載時產生，不會自動傳送到 ChatGPT 或第三方服務。</p><Link className="ui-btn ui-btn-secondary mt-3" href="/import/backup">還原 Full Backup</Link></div>
    <form className="ui-card grid gap-3 sm:grid-cols-3" method="get">
      <ExportRangeFields end={filters.end} range={range} start={filters.start} />
      <label className="text-sm font-semibold">店家<input className={field} defaultValue={filters.merchant} name="merchant" /></label>
      <label className="text-sm font-semibold">類別<select className={field} defaultValue={filters.category ?? ""} name="category"><option value="">全部</option>{EXPENSE_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-sm font-semibold">商品群組<input className={field} defaultValue={filters.product_group} name="product_group" /></label>
      <label className="text-sm font-semibold">品牌<input className={field} defaultValue={filters.brand} name="brand" /></label>
      <label className="text-sm font-semibold">來源<select className={field} defaultValue={filters.source ?? ""} name="source"><option value="">全部</option>{EXPENSE_SOURCES.map((value) => <option key={value} value={value}>{SOURCE_LABELS[value]}</option>)}</select></label>
      <button className="ui-btn ui-btn-primary self-end" type="submit">更新預覽</button>
    </form>
    {result.error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{result.error}</p>}
    {preview && <section aria-labelledby="export-preview-title" className="ui-card"><h2 className="text-lg font-bold" id="export-preview-title">匯出預覽</h2>
      <p className="mt-3 rounded-xl border border-blue-400/30 bg-blue-500/10 p-3 text-sm text-blue-200"><strong>實際匯出範圍：</strong>{filters.start ?? "最早"} ～ {filters.end ?? "最新"}（Europe/Berlin 日期）{activeFilters.length ? `；其他篩選：${activeFilters.join("、")}` : ""}</p>
      {partial && <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">這是部分資料。Full Backup 會標示為「部分備份」，不能用於 Replace all。</p>}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><dt className="ui-muted">消費</dt><dd className="font-semibold">{preview.expenseCount} 筆</dd></div><div><dt className="ui-muted">商品／調整</dt><dd className="font-semibold">{preview.itemCount}／{preview.adjustmentCount}</dd></div><div><dt className="ui-muted">預估大小</dt><dd className="font-semibold">約 {size(preview.estimatedBytes)}</dd></div><div><dt className="ui-muted">幣別</dt><dd className="font-semibold">{[...preview.currencies].sort().join("、") || "無"}</dd></div><div className="col-span-2 sm:col-span-4"><dt className="ui-muted">來源</dt><dd className="break-words font-semibold">{[...preview.sources.entries()].map(([name, count]) => `${SOURCE_LABELS[name] ?? name} ${count}`).join("、") || "無"}</dd></div></dl>
    </section>}
    {preview && <section aria-label="下載格式" className="grid gap-4 sm:grid-cols-2">{formats.map((format) => <article className="ui-card flex flex-col" key={format.value}><h2 className="text-base font-bold">{format.title}</h2><p className="mt-2 flex-1 text-sm ui-muted">{format.description}</p><a className="ui-btn ui-btn-primary mt-4 self-start" download href={`/export/download/${format.value}?${query}`}>下載</a></article>)}</section>}
    <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">將匯出檔案上傳到 ChatGPT，會把檔案內容傳送至 ChatGPT 服務。請先確認資料內容與你的隱私需求。</p>
  </div></main>;
}
