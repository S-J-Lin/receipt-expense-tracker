import Link from "next/link";
import { calculateItemAnalytics, resolveDateRange } from "@/lib/item-analytics";
import { searchItems } from "@/lib/items";
import { formatMoneyFromCents } from "@/lib/money";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/types/expense";

export const dynamic = "force-dynamic";
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const field = "min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2";

function Breakdown({ title, values, currency }: { title: string; values: [string, number][]; currency: string }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-bold">{title}</h2><ul className="mt-3 divide-y divide-slate-100">{values.map(([name, cents]) => <li className="flex justify-between gap-3 py-2" key={name}><span>{name}</span><strong>{formatMoneyFromCents(cents, currency)}</strong></li>)}</ul></section>;
}

export default async function ItemsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const range = one(params.range) ?? "3m";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  const dates = resolveDateRange(range, today, one(params.start), one(params.end));
  const categoryValue = one(params.category); const category = EXPENSE_CATEGORIES.includes(categoryValue as ExpenseCategory) ? categoryValue as ExpenseCategory : undefined;
  const filters = { query: one(params.query), start: dates.start, end: dates.end, merchant: one(params.merchant), brand: one(params.brand), productGroup: one(params.group), category };
  const result = await searchItems(filters); const analytics = calculateItemAnalytics(result.data); const currency = result.data[0]?.currency ?? "EUR";
  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-6xl space-y-5"><div><h1 className="text-3xl font-bold">商品搜尋與分析</h1><p className="mt-1 text-slate-600">依標準名稱、原始名稱、品牌、群組或已確認別名搜尋。</p></div>
    <form className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-3" method="get"><input className={`${field} sm:col-span-2`} defaultValue={filters.query} name="query" placeholder="例如：洗碗精、Spülmittel、Denkmit" /><select className={field} defaultValue={range} name="range"><option value="30d">最近 30 天</option><option value="3m">最近 3 個月</option><option value="6m">最近 6 個月</option><option value="year">今年</option><option value="custom">自訂日期</option></select>{range === "custom" && <><input className={field} defaultValue={dates.start} name="start" type="date" /><input className={field} defaultValue={dates.end} name="end" type="date" /></>}<input className={field} defaultValue={filters.merchant} name="merchant" placeholder="商店" /><input className={field} defaultValue={filters.brand} name="brand" placeholder="品牌" /><input className={field} defaultValue={filters.productGroup} name="group" placeholder="商品群組" /><select className={field} defaultValue={category ?? ""} name="category"><option value="">全部類別</option>{EXPENSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select><button className="min-h-11 rounded-xl bg-indigo-600 px-4 font-semibold text-white" type="submit">搜尋</button></form>
    {result.error && <p className="rounded-2xl bg-red-50 p-4 text-red-800">{result.error}</p>}
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-6">{[["總支出",formatMoneyFromCents(analytics.totalCents,currency)],["購買次數",String(analytics.count)],["平均",formatMoneyFromCents(analytics.averageCents,currency)],["最低",formatMoneyFromCents(analytics.minCents,currency)],["最高",formatMoneyFromCents(analytics.maxCents,currency)],["最近購買",analytics.latestDate??"—"]].map(([label,value])=><div className="rounded-2xl border border-slate-200 bg-white p-4" key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>)}</section>
    <div className="grid gap-4 lg:grid-cols-4"><Breakdown currency={currency} title="標準商品" values={analytics.byNormalizedName}/><Breakdown currency={currency} title="品牌支出" values={analytics.byBrand}/><Breakdown currency={currency} title="商店支出" values={analytics.byMerchant}/><Breakdown currency={currency} title="月度趨勢" values={analytics.byMonth}/></div>
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50"><tr>{["標準名稱","原始名稱","品牌","商店／日期","金額","類別／群組"].map((item)=><th className="p-3" key={item}>{item}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{result.data.map((item)=><tr key={item.id}><td className="p-3 font-semibold">{item.name_normalized??item.name_original}</td><td className="p-3">{item.name_original}</td><td className="p-3">{item.brand??"—"}</td><td className="p-3">{item.merchant}<br/><span className="text-slate-500">{item.expense_date}</span></td><td className="p-3 font-semibold">{formatMoneyFromCents(Math.round(item.amount*100),item.currency)}</td><td className="p-3">{item.category}<br/><span className="text-slate-500">{item.product_group??"—"}</span></td></tr>)}</tbody></table></div>{result.data.length===0&&<p className="p-8 text-center text-slate-500">找不到符合條件的商品。</p>}</section>
    <Link className="inline-flex text-sm font-semibold text-indigo-700" href="/">← 返回 Dashboard</Link></div></main>;
}
