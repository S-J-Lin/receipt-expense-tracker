import Link from "next/link";
import { getExportDataset } from "@/lib/export-data";
import { exportPreview, type ExportFormat } from "@/lib/export";
import { filtersToSearchParams, parseExportQuery } from "@/lib/export-query";
import { EXPENSE_CATEGORIES, EXPENSE_SOURCES } from "@/types/expense";

export const dynamic = "force-dynamic";
const field = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2";
const formats: { value: ExportFormat; title: string; description: string }[] = [
  { value: "expenses-csv", title: "CSV — Expenses", description: "每列一筆消費，適合試算表。" },
  { value: "items-csv", title: "CSV — Itemized Purchases", description: "每列一個商品或 adjustment。" },
  { value: "full-json", title: "JSON — Full Backup", description: "完整關聯資料與 aliases；不含秘密或 signed URL。" },
  { value: "chatgpt-json", title: "JSON — ChatGPT Analysis Bundle", description: "乾淨的分析資料，不含內部 ID 或收據路徑。" },
];

function size(bytes: number): string { return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

export default async function ExportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { range, filters } = parseExportQuery(params);
  const result = await getExportDataset(filters);
  const preview = result.data ? exportPreview(result.data, filters) : null;
  const query = filtersToSearchParams(range, filters).toString();
  const activeFilters = [filters.merchant && `店家：${filters.merchant}`, filters.category && `類別：${filters.category}`, filters.product_group && `商品群組：${filters.product_group}`, filters.brand && `品牌：${filters.brand}`, filters.source && `來源：${filters.source}`].filter(Boolean);

  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-5xl space-y-6">
    <div><Link className="text-sm font-semibold text-indigo-600" href="/">← 返回首頁</Link><h1 className="mt-3 text-3xl font-bold">匯出資料</h1><p className="mt-2 text-slate-600">資料只在你主動下載時產生，不會自動傳送到 ChatGPT 或第三方服務。</p></div>
    <form className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 sm:grid-cols-3" method="get">
      <label className="text-sm font-medium">日期範圍<select className={field} defaultValue={range} name="range"><option value="all">全部</option><option value="month">本月</option><option value="3m">最近 3 個月</option><option value="6m">最近 6 個月</option><option value="year">今年</option><option value="custom">自訂</option></select></label>
      <label className="text-sm font-medium">開始日期<input className={field} defaultValue={filters.start} name="start" type="date" /></label>
      <label className="text-sm font-medium">結束日期<input className={field} defaultValue={filters.end} name="end" type="date" /></label>
      <label className="text-sm font-medium">店家<input className={field} defaultValue={filters.merchant} name="merchant" /></label>
      <label className="text-sm font-medium">類別<select className={field} defaultValue={filters.category ?? ""} name="category"><option value="">全部</option>{EXPENSE_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-sm font-medium">商品群組<input className={field} defaultValue={filters.product_group} name="product_group" /></label>
      <label className="text-sm font-medium">品牌<input className={field} defaultValue={filters.brand} name="brand" /></label>
      <label className="text-sm font-medium">來源<select className={field} defaultValue={filters.source ?? ""} name="source"><option value="">全部</option>{EXPENSE_SOURCES.map((value) => <option key={value}>{value}</option>)}</select></label>
      <button className="min-h-11 self-end rounded-xl bg-indigo-600 px-4 font-semibold text-white" type="submit">更新預覽</button>
    </form>
    {result.error && <p className="rounded-2xl bg-red-50 p-4 text-red-800" role="alert">{result.error}</p>}
    {preview && <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">匯出預覽</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><p><span className="block text-sm text-slate-500">日期</span>{filters.start ?? "最早"}～{filters.end ?? "最新"}</p><p><span className="block text-sm text-slate-500">消費</span>{preview.expenseCount} 筆</p><p><span className="block text-sm text-slate-500">商品／調整</span>{preview.itemCount}／{preview.adjustmentCount}</p><p><span className="block text-sm text-slate-500">預估大小</span>{size(preview.estimatedBytes)}</p><p className="col-span-2"><span className="block text-sm text-slate-500">來源</span>{[...preview.sources.entries()].map(([name, count]) => `${name} ${count}`).join("、") || "無"}</p><p className="col-span-2"><span className="block text-sm text-slate-500">幣別</span>{[...preview.currencies].sort().join("、") || "無"}</p></div><p className="mt-3 text-sm text-slate-600">篩選：{activeFilters.join("；") || "無（全部資料）"}</p></section>}
    <section className="grid gap-4 sm:grid-cols-2">{formats.map((format) => <article className="rounded-3xl border border-slate-200 bg-white p-5" key={format.value}><h2 className="text-lg font-bold">{format.title}</h2><p className="mt-2 min-h-12 text-sm text-slate-600">{format.description}</p><a className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 font-semibold text-white" href={`/export/download/${format.value}?${query}`}>下載</a></article>)}</section>
    <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">將匯出檔案上傳到 ChatGPT，會把檔案內容傳送至 ChatGPT 服務。請先確認資料內容與你的隱私需求。</p>
  </div></main>;
}
