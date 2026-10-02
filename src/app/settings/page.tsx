import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { requireAuthorizedUser } from "@/lib/auth";

export default async function SettingsPage() {
  await requireAuthorizedUser();
  return <main className="flex-1 px-4 py-6"><div className="mx-auto max-w-2xl space-y-5"><h1 className="text-2xl font-semibold">更多</h1>
    <section className="rounded-2xl border border-[#2c2c2c] bg-[#1e1e1e] p-5"><div className="flex flex-col gap-3"><Link href="/expenses">消費紀錄</Link><Link href="/items">商品明細</Link><Link href="/recurring">固定支出</Link><Link href="/import/backup">備份還原</Link></div></section>
    <form action={logoutAction}><button className="min-h-11 rounded-xl border border-[#444] px-5 text-[#f5f5f5]" type="submit">登出</button></form>
  </div></main>;
}
