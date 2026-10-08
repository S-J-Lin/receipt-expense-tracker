import type { Metadata } from "next";
import Link from "next/link";
import { calculateItemAnalyticsByCurrency, resolveDateRange } from "@/lib/item-analytics";
import { searchItems } from "@/lib/items";
import { formatMoneyFromCents, moneyToCents } from "@/lib/money";
import { localIsoDate } from "@/lib/local-date";
import { itemBrand, itemProductGroup } from "@/lib/item-display";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/types/expense";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "商品分析" };

const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const field = "mt-1 min-h-12 w-full rounded-xl border px-3 py-2";
const RESULT_DISPLAY_LIMIT = 200;

function Breakdown({ title, values, currency }: { title: string; values: [string, number][]; currency: string }) {
  const top = values.slice(0, 6);
  const rest = values.slice(6);
  const row = ([name, cents]: [string, number]) => <li className="flex min-w-0 items-baseline justify-between gap-3 py-2" key={name}><span className="min-w-0 break-words">{name}</span><strong className="money-value shrink-0">{formatMoneyFromCents(cents, currency)}</strong></li>;
  return <section className="ui-card"><h3 className="font-semibold">{title}</h3>
    {values.length === 0 ? <p className="mt-3 text-sm ui-muted">沒有資料。</p> : <ul className="mt-2 divide-y divide-[var(--border)]">{top.map(row)}</ul>}
    {rest.length > 0 && <details className="mt-1"><summary className="text-sm font-semibold text-[var(--accent)]">顯示其餘 {rest.length} 項</summary><ul className="divide-y divide-[var(--border)]">{rest.map(row)}</ul></details>}
  </section>;
}

export default async function ItemsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const range = one(params.range) ?? "3m";
  const today = localIsoDate();
  const dates = resolveDateRange(range, today, one(params.start), one(params.end));
  const categoryValue = one(params.category);
  const category = EXPENSE_CATEGORIES.includes(categoryValue as ExpenseCategory) ? categoryValue as ExpenseCategory : undefined;
  const filters = { query: one(params.query), start: dates.start, end: dates.end, merchant: one(params.merchant), brand: one(params.brand), productGroup: one(params.group), category };
  const result = await searchItems(filters);
  const byCurrency = result.error ? [] : calculateItemAnalyticsByCurrency(result.data);
  const rows = [...result.data].sort((a, b) => b.expense_date.localeCompare(a.expense_date) || a.id.localeCompare(b.id));
  const shown = rows.slice(0, RESULT_DISPLAY_LIMIT);

  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-6xl space-y-5">
    <div><h1 className="text-2xl font-bold sm:text-3xl">商品搜尋與分析</h1><p className="mt-1 ui-muted">依標準名稱、原始名稱、品牌、群組或已確認別名搜尋。不同幣別分開統計，不換匯。</p></div>
    <form className="ui-card grid gap-3 sm:grid-cols-3" method="get">
      <label className="text-sm font-semibold sm:col-span-2">關鍵字<input className={field} defaultValue={filters.query} enterKeyHint="search" name="query" placeholder="例如：洗碗精、Spülmittel、Denkmit" /></label>
      <label className="text-sm font-semibold">期間<select className={field} defaultValue={range} name="range"><option value="30d">最近 30 天</option><option value="3m">最近 3 個月</option><option value="6m">最近 6 個月</option><option value="year">今年</option><option value="custom">自訂日期</option></select></label>
      {range === "custom" && <><label className="text-sm font-semibold">開始日期<input className={field} defaultValue={dates.start} name="start" type="date" /></label><label className="text-sm font-semibold">結束日期<input className={field} defaultValue={dates.end} name="end" type="date" /></label></>}
      <label className="text-sm font-semibold">商店<input className={field} defaultValue={filters.merchant} name="merchant" /></label>
      <label className="text-sm font-semibold">品牌<input className={field} defaultValue={filters.brand} name="brand" /></label>
      <label className="text-sm font-semibold">商品群組<input className={field} defaultValue={filters.productGroup} name="group" /></label>
      <label className="text-sm font-semibold">類別<select className={field} defaultValue={category ?? ""} name="category"><option value="">全部類別</option>{EXPENSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
      <button className="ui-btn ui-btn-primary self-end" type="submit">搜尋</button>
    </form>

    {result.error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{result.error}</p>}
    {!result.error && rows.length === 0 && <p className="ui-card text-center ui-muted">找不到符合條件的商品。可放寬期間或關鍵字。</p>}

    {byCurrency.map(({ currency, analytics }) => <section aria-labelledby={`items-${currency}`} className="space-y-3" key={currency}>
      <h2 className="text-lg font-bold" id={`items-${currency}`}>{currency} 統計</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{[["總支出", formatMoneyFromCents(analytics.totalCents, currency)], ["購買次數", String(analytics.count)], ["平均", formatMoneyFromCents(analytics.averageCents, currency)], ["最低", formatMoneyFromCents(analytics.minCents, currency)], ["最高", formatMoneyFromCents(analytics.maxCents, currency)], ["最近購買", analytics.latestDate ?? "—"]].map(([label, value]) => <div className="ui-card ui-compact" key={label}><p className="text-xs ui-muted">{label}</p><p className="money-value mt-1 truncate font-bold" title={value}>{value}</p></div>)}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Breakdown currency={currency} title="標準商品" values={analytics.byNormalizedName} /><Breakdown currency={currency} title="品牌支出" values={analytics.byBrand} /><Breakdown currency={currency} title="商店支出" values={analytics.byMerchant} /><Breakdown currency={currency} title="月度趨勢" values={analytics.byMonth} /></div>
    </section>)}

    {rows.length > 0 && <section aria-labelledby="item-results" className="space-y-3">
      <h2 className="text-lg font-bold" id="item-results">購買紀錄 <span className="text-sm font-normal ui-muted">{rows.length} 筆{rows.length > RESULT_DISPLAY_LIMIT ? `，顯示最近 ${RESULT_DISPLAY_LIMIT} 筆（統計仍包含全部）` : ""}</span></h2>
      <ul className="space-y-2 md:hidden">{shown.map((item) => <li className="ui-card ui-compact" key={item.id}>
        <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="line-clamp-2 break-words font-semibold">{item.name_normalized ?? item.name_original}</p>{item.name_original && item.name_original !== item.name_normalized && <p className="mt-0.5 line-clamp-2 break-words text-sm ui-muted">{item.name_original}</p>}</div><p className="money-value shrink-0 font-semibold">{formatMoneyFromCents(moneyToCents(item.amount), item.currency)}</p></div>
        <p className="mt-2 break-words text-sm ui-muted">{[itemBrand(item.brand), item.merchant, item.expense_date].join(" · ")}</p>
        <p className="mt-1 break-words text-xs ui-muted">{item.category} · {itemProductGroup(item.product_group)}</p>
      </li>)}</ul>
      <div className="hidden overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] md:block"><table className="w-full table-fixed text-left text-sm"><thead className="bg-[var(--background-secondary)]"><tr>{["標準名稱", "原始名稱", "品牌", "商店／日期", "金額", "類別／群組"].map((label) => <th className="p-3 font-semibold" key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{shown.map((item) => <tr key={item.id}><td className="break-words p-3 font-semibold">{item.name_normalized ?? item.name_original}</td><td className="break-words p-3">{item.name_original}</td><td className="break-words p-3">{itemBrand(item.brand)}</td><td className="break-words p-3">{item.merchant}<br /><span className="ui-muted">{item.expense_date}</span></td><td className="money-value p-3 font-semibold">{formatMoneyFromCents(moneyToCents(item.amount), item.currency)}</td><td className="break-words p-3">{item.category}<br /><span className="ui-muted">{itemProductGroup(item.product_group)}</span></td></tr>)}</tbody></table></div>
    </section>}
    <Link className="ui-link text-sm" href="/">← 返回首頁</Link>
  </div></main>;
}
