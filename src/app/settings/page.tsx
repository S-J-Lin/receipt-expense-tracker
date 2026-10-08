import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { requireAuthorizedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "更多" };

const LINKS = [
  { href: "/expenses", title: "消費紀錄", description: "搜尋、篩選、編輯與刪除" },
  { href: "/items", title: "商品分析", description: "依商品、品牌、商店與月份統計" },
  { href: "/recurring", title: "固定支出", description: "房租、保險、訂閱等每月規則" },
  { href: "/export", title: "匯出資料", description: "CSV、Full Backup、ChatGPT 分析包" },
  { href: "/import/backup", title: "備份還原", description: "從 Full Backup 還原資料" },
];

export default async function SettingsPage() {
  await requireAuthorizedUser();
  return <main className="flex-1 px-4 py-6"><div className="mx-auto max-w-2xl space-y-5"><h1 className="text-2xl font-bold">更多</h1>
    <nav aria-label="更多功能" className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]"><ul className="divide-y divide-[var(--border)]">{LINKS.map((link) => <li key={link.href}><Link className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-slate-100" href={link.href}><span className="min-w-0"><span className="block font-semibold">{link.title}</span><span className="block text-sm ui-muted">{link.description}</span></span><span aria-hidden="true" className="shrink-0 ui-muted">›</span></Link></li>)}</ul></nav>
    <form action={logoutAction} className="pt-2"><button className="ui-btn ui-btn-secondary w-full sm:w-auto" type="submit">登出</button></form>
  </div></main>;
}
